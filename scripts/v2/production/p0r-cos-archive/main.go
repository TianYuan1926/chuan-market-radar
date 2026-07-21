package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	credentialSchema = "v2-m1-production-storage-cos-temporary-credentials.v1"
	archiveSchema    = "v2-m1-production-storage-cos-archive-facts.v1"
	maximumObject    = int64(5 * 1024 * 1024 * 1024)
	minimumRemaining = 2 * time.Hour
	maximumLifetime  = 36 * time.Hour
	retentionPeriod  = 31 * 24 * time.Hour
)

var (
	bucketPattern   = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,48}-[0-9]{5,20}$`)
	regionPattern   = regexp.MustCompile(`^ap-[a-z0-9-]{2,32}$`)
	keyPattern      = regexp.MustCompile(`^market-radar-v2/p0r/[a-z0-9][a-z0-9._/-]{15,240}\.dump\.age$`)
	requiredActions = []string{
		"cos:GetBucketACL",
		"cos:GetBucketObjectLockConfiguration",
		"cos:GetBucketPolicy",
		"cos:GetBucketVersioning",
		"cos:GetObject",
		"cos:GetObjectACL",
		"cos:GetObjectRetention",
		"cos:HeadObject",
		"cos:PutObject",
	}
)

type credentialGrant struct {
	Actions   []string `json:"actions"`
	Bucket    string   `json:"bucket"`
	ObjectKey string   `json:"objectKey"`
	Region    string   `json:"region"`
}

type credentialEnvelope struct {
	ExpiresAt     string          `json:"expiresAt"`
	Grant         credentialGrant `json:"grant"`
	IssuedAt      string          `json:"issuedAt"`
	SchemaVersion string          `json:"schemaVersion"`
	SecretID      string          `json:"secretId"`
	SecretKey     string          `json:"secretKey"`
	SessionToken  string          `json:"sessionToken"`
}

type controlPlaneProof struct {
	BucketAclPrivate      bool   `json:"bucketAclPrivate"`
	BucketPolicyPublic    bool   `json:"bucketPolicyPublicAccess"`
	CredentialGrantDigest string `json:"credentialGrantDigest"`
	DefaultRetentionDays  int    `json:"defaultRetentionDays"`
	DefaultRetentionMode  string `json:"defaultRetentionMode"`
	DestinationDigest     string `json:"destinationIdentityDigest"`
	ObjectAclPrivate      bool   `json:"objectAclPrivate"`
	ObjectLockEnabled     bool   `json:"objectLockEnabled"`
	VersioningStatus      string `json:"versioningStatus"`
}

type offHostFacts struct {
	ArchiveVerified             bool   `json:"archiveVerified"`
	BucketAclPrivate            bool   `json:"bucketAclPrivate"`
	BucketPolicyPublicAccess    bool   `json:"bucketPolicyPublicAccess"`
	ChecksumVerified            bool   `json:"checksumVerified"`
	ControlPlaneEvidenceDigest  string `json:"controlPlaneEvidenceDigest"`
	CredentialExpiresAt         string `json:"credentialExpiresAt"`
	DestinationIdentityDigest   string `json:"destinationIdentityDigest"`
	ObjectIdentityDigest        string `json:"objectIdentityDigest"`
	ObjectLockEnabled           bool   `json:"objectLockEnabled"`
	ObjectRetentionMode         string `json:"objectRetentionMode"`
	ObjectRetentionUntil        string `json:"objectRetentionUntil"`
	ObjectVersionIdentityDigest string `json:"objectVersionIdentityDigest"`
	PrivateAccessVerified       bool   `json:"privateAccessVerified"`
	Provider                    string `json:"provider"`
	RetrievedAt                 string `json:"retrievedAt"`
	RetrievedBytes              int64  `json:"retrievedBytes"`
	RetrievedDigest             string `json:"retrievedDigest"`
	ServerSideEncryption        string `json:"serverSideEncryption"`
	TemporaryCredentials        bool   `json:"temporaryCredentials"`
	UploadedAt                  string `json:"uploadedAt"`
	VersioningStatus            string `json:"versioningStatus"`
}

type archiveEvidence struct {
	EvidenceDigest string       `json:"evidenceDigest"`
	OffHost        offHostFacts `json:"offHost"`
	SchemaVersion  string       `json:"schemaVersion"`
}

type aclOwner struct {
	ID string `xml:"ID"`
}

type aclGrantee struct {
	ID         string `xml:"ID"`
	SubAccount string `xml:"Subaccount"`
	UIN        string `xml:"uin"`
	URI        string `xml:"URI"`
}

type aclGrant struct {
	Grantee    *aclGrantee `xml:"Grantee"`
	Permission string      `xml:"Permission"`
}

type aclDocument struct {
	Owner  *aclOwner  `xml:"Owner"`
	Grants []aclGrant `xml:"AccessControlList>Grant"`
}

type bucketPolicyStatement struct {
	Effect    string          `json:"effect"`
	Principal json.RawMessage `json:"principal"`
}

type bucketPolicy struct {
	Statements []bucketPolicyStatement `json:"statement"`
}

type versioningDocument struct {
	Status string `xml:"Status"`
}

type objectLockDocument struct {
	Enabled string `xml:"ObjectLockEnabled"`
	Days    int    `xml:"Rule>DefaultRetention>Days"`
	Mode    string `xml:"Rule>DefaultRetention>Mode"`
}

type retentionDocument struct {
	Mode        string `xml:"Mode"`
	RetainUntil string `xml:"RetainUntilDate"`
}

type cosHTTPError struct {
	Code       string
	StatusCode int
}

func (value *cosHTTPError) Error() string {
	return fmt.Sprintf("COS request failed with status %d and code %s", value.StatusCode, value.Code)
}

type cosClient struct {
	credentials credentialEnvelope
	endpoint    *url.URL
	http        *http.Client
}

func canonicalTime(value string, label string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil || parsed.UTC().Format("2006-01-02T15:04:05.000Z") != value {
		return time.Time{}, fmt.Errorf("%s must be canonical UTC milliseconds", label)
	}
	return parsed, nil
}

func digestJSON(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func digestFile(path string) (string, int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()
	hash := sha256.New()
	bytes, err := io.Copy(hash, file)
	if err != nil {
		return "", 0, err
	}
	return "sha256:" + hex.EncodeToString(hash.Sum(nil)), bytes, nil
}

func readCredentialFile(path string) (credentialEnvelope, error) {
	var value credentialEnvelope
	info, err := os.Lstat(path)
	if err != nil {
		return value, err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return value, errors.New("credential file must be a regular non-symlink file")
	}
	if info.Mode().Perm()&0o077 != 0 {
		return value, errors.New("credential file must not be accessible by group or other")
	}
	if info.Size() <= 0 || info.Size() > 64*1024 {
		return value, errors.New("credential file size is invalid")
	}
	file, err := os.Open(path)
	if err != nil {
		return value, err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 64*1024+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return value, fmt.Errorf("credential file is invalid: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return value, errors.New("credential file must contain one JSON object")
	}
	return value, nil
}

func validateCredentials(value credentialEnvelope, now time.Time) error {
	if value.SchemaVersion != credentialSchema {
		return errors.New("credential schema version mismatch")
	}
	if len(value.SecretID) < 12 || len(value.SecretKey) < 16 || len(value.SessionToken) < 16 {
		return errors.New("temporary credential material is incomplete")
	}
	for _, secret := range []string{value.SecretID, value.SecretKey, value.SessionToken} {
		if strings.TrimSpace(secret) != secret || strings.ContainsAny(secret, "\r\n\x00") {
			return errors.New("temporary credential material contains forbidden whitespace")
		}
	}
	issuedAt, err := canonicalTime(value.IssuedAt, "issuedAt")
	if err != nil {
		return err
	}
	expiresAt, err := canonicalTime(value.ExpiresAt, "expiresAt")
	if err != nil {
		return err
	}
	now = now.UTC()
	if issuedAt.After(now) || expiresAt.Sub(now) < minimumRemaining {
		return errors.New("temporary credentials do not cover the recovery window")
	}
	if expiresAt.Sub(issuedAt) <= 0 || expiresAt.Sub(issuedAt) > maximumLifetime {
		return errors.New("temporary credential lifetime is invalid")
	}
	if !bucketPattern.MatchString(value.Grant.Bucket) || !regionPattern.MatchString(value.Grant.Region) {
		return errors.New("COS destination identity is invalid")
	}
	if !keyPattern.MatchString(value.Grant.ObjectKey) || strings.Contains(value.Grant.ObjectKey, "..") {
		return errors.New("COS object key is outside the P0R namespace")
	}
	actions := append([]string(nil), value.Grant.Actions...)
	sort.Strings(actions)
	expected := append([]string(nil), requiredActions...)
	sort.Strings(expected)
	if strings.Join(actions, "\n") != strings.Join(expected, "\n") {
		return errors.New("temporary credential action declaration is not exact")
	}
	return nil
}

func aclIsPrivate(value *aclDocument) bool {
	if value == nil || value.Owner == nil || strings.TrimSpace(value.Owner.ID) == "" || len(value.Grants) != 1 {
		return false
	}
	grant := value.Grants[0]
	if grant.Grantee == nil || grant.Grantee.ID != value.Owner.ID || grant.Permission != "FULL_CONTROL" {
		return false
	}
	return grant.Grantee.URI == "" && grant.Grantee.UIN == "" && grant.Grantee.SubAccount == ""
}

func objectLockMeetsPolicy(value objectLockDocument) bool {
	return strings.EqualFold(value.Enabled, "Enabled") &&
		strings.EqualFold(value.Mode, "COMPLIANCE") &&
		value.Days >= 30
}

func containsPublicPrincipal(value any) bool {
	switch typed := value.(type) {
	case string:
		lower := strings.ToLower(typed)
		return strings.Contains(typed, "*") || strings.Contains(lower, "anyone") || strings.Contains(lower, "anonymous") || strings.Contains(lower, "allusers") || strings.Contains(lower, "authenticatedusers")
	case []any:
		for _, entry := range typed {
			if containsPublicPrincipal(entry) {
				return true
			}
		}
	case map[string]any:
		for _, entry := range typed {
			if containsPublicPrincipal(entry) {
				return true
			}
		}
	}
	return false
}

func policyAllowsPublic(value *bucketPolicy) bool {
	if value == nil {
		return false
	}
	for _, statement := range value.Statements {
		if !strings.EqualFold(statement.Effect, "allow") {
			continue
		}
		var principal any
		decoder := json.NewDecoder(bytes.NewReader(statement.Principal))
		decoder.UseNumber()
		if len(statement.Principal) == 0 || decoder.Decode(&principal) != nil {
			return true
		}
		if containsPublicPrincipal(principal) {
			return true
		}
	}
	return false
}

func isMissingPolicy(err error) bool {
	var response *cosHTTPError
	if !errors.As(err, &response) {
		return false
	}
	return response.StatusCode == http.StatusNotFound || response.Code == "NoSuchBucketPolicy"
}

func encodeURIComponent(value string) string {
	var output strings.Builder
	for index := 0; index < len(value); index++ {
		character := value[index]
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			strings.ContainsRune("-_.!~*'()", rune(character)) {
			output.WriteByte(character)
			continue
		}
		fmt.Fprintf(&output, "%%%02X", character)
	}
	return output.String()
}

func safeURLEncode(value string) string {
	encoded := encodeURIComponent(value)
	replacer := strings.NewReplacer(
		"!", "%21",
		"'", "%27",
		"(", "%28",
		")", "%29",
		"*", "%2A",
	)
	return replacer.Replace(encoded)
}

func encodeSignedValues(values map[string][]string) (string, []string) {
	keys := make([]string, 0, len(values))
	normalized := make(map[string][]string, len(values))
	for key, entries := range values {
		encodedKey := strings.ToLower(safeURLEncode(key))
		keys = append(keys, encodedKey)
		normalized[encodedKey] = append(normalized[encodedKey], entries...)
	}
	sort.Strings(keys)
	pairs := make([]string, 0)
	for _, key := range keys {
		entries := normalized[key]
		sort.Strings(entries)
		for _, entry := range entries {
			pairs = append(pairs, key+"="+safeURLEncode(entry))
		}
	}
	return strings.Join(pairs, "&"), keys
}

func signedHeader(name string) bool {
	lower := strings.ToLower(name)
	if strings.HasPrefix(lower, "x-cos-") {
		return true
	}
	switch lower {
	case "host", "range", "cache-control", "content-disposition", "content-encoding", "content-type", "content-length", "content-md5", "transfer-encoding", "expect", "expires", "if-match", "if-modified-since", "if-none-match", "if-unmodified-since", "origin":
		return true
	default:
		return false
	}
}

func hmacSHA1(key string, message string) []byte {
	hash := hmac.New(sha1.New, []byte(key))
	_, _ = hash.Write([]byte(message))
	return hash.Sum(nil)
}

func authorization(credentials credentialEnvelope, request *http.Request, start time.Time, end time.Time) string {
	keyTime := fmt.Sprintf("%d;%d", start.Unix(), end.Unix())
	signKey := hex.EncodeToString(hmacSHA1(credentials.SecretKey, keyTime))
	headers := make(map[string][]string)
	for name, entries := range request.Header {
		if signedHeader(name) {
			headers[name] = append([]string(nil), entries...)
		}
	}
	headers["Host"] = []string{request.Host}
	formattedHeaders, headerList := encodeSignedValues(headers)
	parameters := make(map[string][]string)
	for name, entries := range request.URL.Query() {
		parameters[name] = append([]string(nil), entries...)
	}
	formattedParameters, parameterList := encodeSignedValues(parameters)
	formatString := fmt.Sprintf(
		"%s\n%s\n%s\n%s\n",
		strings.ToLower(request.Method),
		request.URL.Path,
		formattedParameters,
		formattedHeaders,
	)
	formatHash := sha1.Sum([]byte(formatString))
	stringToSign := fmt.Sprintf("sha1\n%s\n%x\n", keyTime, formatHash)
	signature := hex.EncodeToString(hmacSHA1(signKey, stringToSign))
	return strings.Join([]string{
		"q-sign-algorithm=sha1",
		"q-ak=" + credentials.SecretID,
		"q-sign-time=" + keyTime,
		"q-key-time=" + keyTime,
		"q-header-list=" + strings.Join(headerList, ";"),
		"q-url-param-list=" + strings.Join(parameterList, ";"),
		"q-signature=" + signature,
	}, "&")
}

func newClient(credentials credentialEnvelope) (*cosClient, error) {
	endpoint, err := url.Parse(fmt.Sprintf(
		"https://%s.cos.%s.myqcloud.com",
		credentials.Grant.Bucket,
		credentials.Grant.Region,
	))
	if err != nil {
		return nil, err
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DisableCompression = true
	transport.DialContext = (&net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext
	transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	transport.TLSHandshakeTimeout = 10 * time.Second
	transport.ResponseHeaderTimeout = 2 * time.Minute
	return &cosClient{
		credentials: credentials,
		endpoint:    endpoint,
		http: &http.Client{
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return errors.New("COS redirect refused")
			},
			Transport: transport,
			Timeout:   20 * time.Minute,
		},
	}, nil
}

func (client *cosClient) request(ctx context.Context, method string, path string, query url.Values, body io.Reader, headers http.Header, contentLength int64) (*http.Response, error) {
	target := client.endpoint.ResolveReference(&url.URL{Path: path, RawQuery: query.Encode()})
	request, err := http.NewRequestWithContext(ctx, method, target.String(), body)
	if err != nil {
		return nil, err
	}
	request.Host = client.endpoint.Host
	for name, values := range headers {
		for _, value := range values {
			request.Header.Add(name, value)
		}
	}
	if contentLength >= 0 {
		request.ContentLength = contentLength
		request.Header.Set("Content-Length", strconv.FormatInt(contentLength, 10))
	}
	request.Header.Set("x-cos-security-token", client.credentials.SessionToken)
	now := time.Now().UTC()
	request.Header.Set("Authorization", authorization(client.credentials, request, now, now.Add(15*time.Minute)))
	response, err := client.http.Do(request)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return nil, errors.New("COS transport request timed out or was cancelled")
		}
		return nil, errors.New("COS transport request failed")
	}
	if response.StatusCode >= 200 && response.StatusCode <= 299 {
		return response, nil
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024))
	errorBody := struct {
		Code string `xml:"Code"`
	}{}
	_ = xml.Unmarshal(data, &errorBody)
	return nil, &cosHTTPError{Code: errorBody.Code, StatusCode: response.StatusCode}
}

func (client *cosClient) getXML(ctx context.Context, path string, query url.Values, output any) error {
	response, err := client.request(ctx, http.MethodGet, path, query, nil, nil, -1)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	decoder := xml.NewDecoder(io.LimitReader(response.Body, 2*1024*1024))
	return decoder.Decode(output)
}

func (client *cosClient) getPolicy(ctx context.Context) (*bucketPolicy, error) {
	response, err := client.request(ctx, http.MethodGet, "/", url.Values{"policy": {""}}, nil, nil, -1)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	var output bucketPolicy
	decoder := json.NewDecoder(io.LimitReader(response.Body, 2*1024*1024))
	if err := decoder.Decode(&output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (client *cosClient) putFile(ctx context.Context, key string, path string, headers http.Header, size int64) (http.Header, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	response, err := client.request(ctx, http.MethodPut, "/"+key, nil, file, headers, size)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	return response.Header.Clone(), nil
}

func (client *cosClient) head(ctx context.Context, key string, versionID string) (http.Header, error) {
	response, err := client.request(ctx, http.MethodHead, "/"+key, url.Values{"versionId": {versionID}}, nil, nil, -1)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	return response.Header.Clone(), nil
}

func (client *cosClient) download(ctx context.Context, key string, versionID string, output string) (err error) {
	file, err := os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	removeOutput := true
	defer func() {
		_ = file.Close()
		if removeOutput {
			_ = os.Remove(output)
		}
	}()
	response, err := client.request(ctx, http.MethodGet, "/"+key, url.Values{"versionId": {versionID}}, nil, nil, -1)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if _, err = io.Copy(file, response.Body); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	removeOutput = false
	return nil
}

func verifyBucket(ctx context.Context, client *cosClient, credentials credentialEnvelope) (controlPlaneProof, error) {
	var proof controlPlaneProof
	var bucketACL aclDocument
	if err := client.getXML(ctx, "/", url.Values{"acl": {""}}, &bucketACL); err != nil {
		return proof, fmt.Errorf("get bucket ACL: %w", err)
	}
	proof.BucketAclPrivate = aclIsPrivate(&bucketACL)
	policy, err := client.getPolicy(ctx)
	if err != nil && !isMissingPolicy(err) {
		return proof, fmt.Errorf("get bucket policy: %w", err)
	}
	proof.BucketPolicyPublic = err == nil && policyAllowsPublic(policy)
	var versioning versioningDocument
	if err := client.getXML(ctx, "/", url.Values{"versioning": {""}}, &versioning); err != nil {
		return proof, fmt.Errorf("get bucket versioning: %w", err)
	}
	proof.VersioningStatus = strings.ToUpper(versioning.Status)
	var objectLock objectLockDocument
	if err := client.getXML(ctx, "/", url.Values{"object-lock": {""}}, &objectLock); err != nil {
		return proof, fmt.Errorf("get bucket object lock: %w", err)
	}
	proof.ObjectLockEnabled = strings.EqualFold(objectLock.Enabled, "Enabled")
	proof.DefaultRetentionDays = objectLock.Days
	proof.DefaultRetentionMode = strings.ToUpper(objectLock.Mode)
	grantDigest, err := digestJSON(credentials.Grant)
	if err != nil {
		return proof, err
	}
	proof.CredentialGrantDigest = grantDigest
	proof.DestinationDigest, err = digestJSON(map[string]string{
		"bucket":   credentials.Grant.Bucket,
		"endpoint": fmt.Sprintf("cos.%s.myqcloud.com", credentials.Grant.Region),
		"region":   credentials.Grant.Region,
	})
	if err != nil {
		return proof, err
	}
	if !proof.BucketAclPrivate || proof.BucketPolicyPublic || proof.VersioningStatus != "ENABLED" || !objectLockMeetsPolicy(objectLock) {
		return proof, errors.New("COS destination does not satisfy private versioned COMPLIANCE retention policy")
	}
	return proof, nil
}

func archive(ctx context.Context, credentials credentialEnvelope, encryptedPath string, retrievedPath string) (archiveEvidence, error) {
	client, err := newClient(credentials)
	if err != nil {
		return archiveEvidence{}, err
	}
	return archiveWithClient(ctx, client, credentials, encryptedPath, retrievedPath)
}

func archiveWithClient(ctx context.Context, client *cosClient, credentials credentialEnvelope, encryptedPath string, retrievedPath string) (archiveEvidence, error) {
	var evidence archiveEvidence
	proof, err := verifyBucket(ctx, client, credentials)
	if err != nil {
		return evidence, err
	}
	inputDigest, inputBytes, err := digestFile(encryptedPath)
	if err != nil {
		return evidence, err
	}
	if inputBytes <= 0 || inputBytes > maximumObject {
		return evidence, errors.New("encrypted backup size is outside the single-object P0R bound")
	}
	if _, err := os.Lstat(retrievedPath); !errors.Is(err, os.ErrNotExist) {
		return evidence, errors.New("retrieved backup path must not already exist")
	}

	uploadStarted := time.Now().UTC()
	retentionUntil := uploadStarted.Add(retentionPeriod).Format("2006-01-02T15:04:05.000Z")
	extraHeaders := make(http.Header)
	extraHeaders.Set("x-cos-forbid-overwrite", "true")
	extraHeaders.Set("x-cos-object-lock-mode", "COMPLIANCE")
	extraHeaders.Set("x-cos-object-lock-retain-until-date", retentionUntil)
	extraHeaders.Set("Content-Type", "application/octet-stream")
	extraHeaders.Set("x-cos-acl", "private")
	extraHeaders.Set("x-cos-server-side-encryption", "AES256")
	putHeaders, err := client.putFile(ctx, credentials.Grant.ObjectKey, encryptedPath, extraHeaders, inputBytes)
	if err != nil {
		return evidence, fmt.Errorf("upload encrypted backup: %w", err)
	}
	uploadedAt := time.Now().UTC()
	versionID := putHeaders.Get("x-cos-version-id")
	if strings.TrimSpace(versionID) == "" {
		return evidence, errors.New("COS upload did not return an object version")
	}
	var objectACL aclDocument
	if err := client.getXML(
		ctx,
		"/"+credentials.Grant.ObjectKey,
		url.Values{"acl": {""}, "versionId": {versionID}},
		&objectACL,
	); err != nil {
		return evidence, fmt.Errorf("get object ACL: %w", err)
	}
	proof.ObjectAclPrivate = aclIsPrivate(&objectACL)
	if !proof.ObjectAclPrivate {
		return evidence, errors.New("uploaded COS object ACL is not private")
	}
	var retention retentionDocument
	if err := client.getXML(
		ctx,
		"/"+credentials.Grant.ObjectKey,
		url.Values{"retention": {""}, "versionId": {versionID}},
		&retention,
	); err != nil {
		return evidence, fmt.Errorf("get object retention: %w", err)
	}
	retainedUntil, err := time.Parse(time.RFC3339Nano, retention.RetainUntil)
	if err != nil {
		return evidence, errors.New("object retention time is invalid")
	}
	retainedUntil = retainedUntil.UTC()
	if retention.Mode != "COMPLIANCE" || retainedUntil.Sub(uploadedAt) < 30*24*time.Hour {
		return evidence, errors.New("uploaded COS object retention is below 30-day COMPLIANCE")
	}
	headHeaders, err := client.head(ctx, credentials.Grant.ObjectKey, versionID)
	if err != nil {
		return evidence, fmt.Errorf("head uploaded object version: %w", err)
	}
	if headHeaders.Get("x-cos-server-side-encryption") != "AES256" {
		return evidence, errors.New("uploaded COS object is missing AES256 server-side encryption")
	}
	contentLength, err := strconv.ParseInt(headHeaders.Get("Content-Length"), 10, 64)
	if err != nil || contentLength != inputBytes {
		return evidence, errors.New("uploaded COS object length does not match encrypted backup")
	}
	if err := client.download(ctx, credentials.Grant.ObjectKey, versionID, retrievedPath); err != nil {
		return evidence, fmt.Errorf("retrieve exact object version: %w", err)
	}
	if err := os.Chmod(retrievedPath, 0o600); err != nil {
		return evidence, err
	}
	retrievedAt := time.Now().UTC()
	retrievedDigest, retrievedBytes, err := digestFile(retrievedPath)
	if err != nil {
		return evidence, err
	}
	if inputDigest != retrievedDigest || inputBytes != retrievedBytes {
		return evidence, errors.New("retrieved COS object does not match encrypted backup")
	}
	controlDigest, err := digestJSON(proof)
	if err != nil {
		return evidence, err
	}
	objectDigest, err := digestJSON(map[string]string{
		"bucket": credentials.Grant.Bucket,
		"key":    credentials.Grant.ObjectKey,
	})
	if err != nil {
		return evidence, err
	}
	versionDigest, err := digestJSON(map[string]string{
		"bucket":    credentials.Grant.Bucket,
		"key":       credentials.Grant.ObjectKey,
		"versionId": versionID,
	})
	if err != nil {
		return evidence, err
	}
	evidence = archiveEvidence{
		OffHost: offHostFacts{
			ArchiveVerified:             true,
			BucketAclPrivate:            true,
			BucketPolicyPublicAccess:    false,
			ChecksumVerified:            true,
			ControlPlaneEvidenceDigest:  controlDigest,
			CredentialExpiresAt:         credentials.ExpiresAt,
			DestinationIdentityDigest:   proof.DestinationDigest,
			ObjectIdentityDigest:        objectDigest,
			ObjectLockEnabled:           true,
			ObjectRetentionMode:         "COMPLIANCE",
			ObjectRetentionUntil:        retainedUntil.UTC().Format("2006-01-02T15:04:05.000Z"),
			ObjectVersionIdentityDigest: versionDigest,
			PrivateAccessVerified:       true,
			Provider:                    "TENCENT_COS",
			RetrievedAt:                 retrievedAt.Format("2006-01-02T15:04:05.000Z"),
			RetrievedBytes:              retrievedBytes,
			RetrievedDigest:             retrievedDigest,
			ServerSideEncryption:        "AES256",
			TemporaryCredentials:        true,
			UploadedAt:                  uploadedAt.Format("2006-01-02T15:04:05.000Z"),
			VersioningStatus:            "ENABLED",
		},
		SchemaVersion: archiveSchema,
	}
	unsigned := struct {
		OffHost       offHostFacts `json:"offHost"`
		SchemaVersion string       `json:"schemaVersion"`
	}{
		OffHost:       evidence.OffHost,
		SchemaVersion: evidence.SchemaVersion,
	}
	evidence.EvidenceDigest, err = digestJSON(unsigned)
	return evidence, err
}

func parseArgs(values []string) (map[string]string, error) {
	if len(values)%2 != 0 {
		return nil, errors.New("arguments must be name/value pairs")
	}
	result := make(map[string]string)
	for index := 0; index < len(values); index += 2 {
		name := values[index]
		if !strings.HasPrefix(name, "--") || len(name) < 3 {
			return nil, errors.New("argument name is invalid")
		}
		if _, exists := result[name]; exists {
			return nil, fmt.Errorf("duplicate argument %s", name)
		}
		result[name] = values[index+1]
	}
	return result, nil
}

func requireRegular(path string, label string) error {
	if !filepath.IsAbs(path) {
		return fmt.Errorf("%s must be absolute", label)
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return fmt.Errorf("%s must be a regular non-symlink file", label)
	}
	return nil
}

func writeEvidence(path string, value archiveEvidence) error {
	if !filepath.IsAbs(path) {
		return errors.New("output path must be absolute")
	}
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	temporary := fmt.Sprintf("%s.%d.tmp", path, os.Getpid())
	file, err := os.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	removeTemporary := true
	defer func() {
		if removeTemporary {
			_ = os.Remove(temporary)
		}
	}()
	if _, err = file.Write(append(encoded, '\n')); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Link(temporary, path); err != nil {
		return err
	}
	if err = os.Remove(temporary); err != nil {
		return err
	}
	removeTemporary = false
	return nil
}

func run() error {
	if len(os.Args) < 2 || os.Args[1] != "archive" {
		return errors.New("command must be archive")
	}
	options, err := parseArgs(os.Args[2:])
	if err != nil {
		return err
	}
	for _, name := range []string{"--credentials", "--encrypted-backup", "--retrieved-backup", "--output"} {
		if options[name] == "" {
			return fmt.Errorf("%s is required", name)
		}
	}
	if len(options) != 4 {
		return errors.New("unknown archive argument")
	}
	if err := requireRegular(options["--credentials"], "credentials"); err != nil {
		return err
	}
	if err := requireRegular(options["--encrypted-backup"], "encrypted backup"); err != nil {
		return err
	}
	credentials, err := readCredentialFile(options["--credentials"])
	if err != nil {
		return err
	}
	if err := validateCredentials(credentials, time.Now()); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Minute)
	defer cancel()
	evidence, err := archive(ctx, credentials, options["--encrypted-backup"], options["--retrieved-backup"])
	if err != nil {
		_ = os.Remove(options["--retrieved-backup"])
		return err
	}
	if err := writeEvidence(options["--output"], evidence); err != nil {
		return err
	}
	fmt.Printf("{\"archiveEvidenceDigest\":%q,\"containsSecret\":false,\"status\":\"PASS_COS_ARCHIVE_RETRIEVAL\"}\n", evidence.EvidenceDigest)
	return nil
}

func main() {
	if err := run(); err != nil {
		message := strings.NewReplacer("\n", " ", "\r", " ").Replace(err.Error())
		fmt.Fprintf(os.Stderr, "{\"reason\":%q,\"status\":\"BLOCKED\"}\n", message)
		os.Exit(1)
	}
}
