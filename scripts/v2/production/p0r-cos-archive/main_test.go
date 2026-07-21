package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func validPlan(now time.Time) provisioningPlan {
	now = now.UTC().Truncate(time.Second)
	runID := "p0r-" + strings.ToLower(now.Format("20060102t150405z")) + "-" + strings.Repeat("a", 32)
	grant := credentialGrant{
		Actions:      append([]string(nil), requiredActions...),
		Bucket:       "market-radar-backup-1250000000",
		ObjectKey:    "market-radar-v2/p0r/" + now.Format("2006-01-02") + "/" + runID + ".dump.age",
		Region:       "ap-hongkong",
		RunID:        runID,
		SourceIPCIDR: "203.0.113.24/32",
	}
	plan := provisioningPlan{
		CredentialGrant: grant,
		OverwriteProtection: overwriteProtection{
			ForbidOverwriteHeaderEffectiveWithVersioning: false,
			Mode:                     "HIGH_ENTROPY_UNIQUE_KEY_PLUS_PREUPLOAD_ABSENCE_CHECK",
			PreUploadAbsenceRequired: true,
		},
		PlanDigest:    "sha256:" + strings.Repeat("1", 64),
		PlannedAt:     now.Format("2006-01-02T15:04:05.000Z"),
		SchemaVersion: planSchema,
		SourceCommit:  strings.Repeat("b", 40),
		STSRequest: stsRequest{
			Action:          "GetFederationToken",
			DurationSeconds: 7200,
			Endpoint:        "sts.tencentcloudapi.com",
			Name:            "MarketRadarRecovery",
			Policy:          map[string]any{"version": "2.0"},
			Version:         "2018-08-13",
		},
	}
	plan.BucketConfiguration.AccessControl = "PRIVATE"
	plan.BucketConfiguration.AvailabilityZoneType = "SINGLE_AZ"
	plan.BucketConfiguration.DefaultEncryption = "SSE_COS_AES256"
	plan.BucketConfiguration.ObjectLock.DefaultRetentionDays = 31
	plan.BucketConfiguration.ObjectLock.Mode = "COMPLIANCE"
	plan.BucketConfiguration.ObjectLock.Permanent = true
	plan.BucketConfiguration.Versioning = "ENABLED"
	return plan
}

func validCredentials(now time.Time) credentialEnvelope {
	plan := validPlan(now)
	policyDigest, _ := digestJSON(plan.STSRequest.Policy)
	requestDigest, _ := digestJSON(plan.STSRequest)
	return credentialEnvelope{
		ExpiresAt: now.Add(2 * time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"),
		Grant:     plan.CredentialGrant,
		Issuance: credentialIssuance{
			DurationSeconds: 7200,
			Method:          "TENCENT_STS_GET_FEDERATION_TOKEN",
			PlanDigest:      plan.PlanDigest,
			PolicyDigest:    policyDigest,
			RequestDigest:   requestDigest,
			RequestID:       "59a5e07e-4147-4d2e-a808-dca76ac5b3fd",
		},
		IssuedAt:      now.UTC().Format("2006-01-02T15:04:05.000Z"),
		SchemaVersion: credentialSchema,
		SecretID:      "AKIDtemporary123456",
		SecretKey:     "temporary-secret-key-material",
		SessionToken:  "temporary-session-token-material",
	}
}

func TestValidateCredentialsAcceptsExactTemporaryScope(t *testing.T) {
	now := time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC)
	if err := validateCredentials(validCredentials(now), validPlan(now), now); err != nil {
		t.Fatalf("valid credentials rejected: %v", err)
	}
}

func TestValidatePlanRejectsInvalidSourceCommit(t *testing.T) {
	now := time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC)
	plan := validPlan(now)
	if err := validatePlan(plan, plan.CredentialGrant.RunID); err != nil {
		t.Fatalf("valid plan rejected: %v", err)
	}
	plan.SourceCommit = "dirty-or-abbreviated"
	if err := validatePlan(plan, plan.CredentialGrant.RunID); err == nil {
		t.Fatal("invalid source commit unexpectedly passed")
	}
}

func TestValidateCredentialsRejectsScopeAndLifetimeInflation(t *testing.T) {
	now := time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC)
	tests := []func(*credentialEnvelope){
		func(value *credentialEnvelope) { value.Grant.Actions = append(value.Grant.Actions, "cos:DeleteObject") },
		func(value *credentialEnvelope) { value.Grant.ObjectKey = "outside/backup.dump.age" },
		func(value *credentialEnvelope) {
			value.ExpiresAt = now.Add(time.Hour).Format("2006-01-02T15:04:05.000Z")
		},
		func(value *credentialEnvelope) {
			value.ExpiresAt = now.Add(37 * time.Hour).Format("2006-01-02T15:04:05.000Z")
		},
		func(value *credentialEnvelope) { value.SessionToken = "" },
		func(value *credentialEnvelope) { value.Issuance.PlanDigest = "sha256:" + strings.Repeat("9", 64) },
	}
	for index, mutate := range tests {
		value := validCredentials(now)
		mutate(&value)
		if err := validateCredentials(value, validPlan(now), now); err == nil {
			t.Fatalf("case %d unexpectedly passed", index)
		}
	}
}

func privateACL() *aclDocument {
	return &aclDocument{
		Owner: &aclOwner{ID: "owner"},
		Grants: []aclGrant{{
			Grantee:    &aclGrantee{ID: "owner"},
			Permission: "FULL_CONTROL",
		}},
	}
}

func TestACLPrivateRejectsGlobalGroups(t *testing.T) {
	if !aclIsPrivate(privateACL()) {
		t.Fatal("owner-only ACL should be private")
	}
	value := privateACL()
	value.Grants = append(value.Grants, aclGrant{
		Grantee:    &aclGrantee{URI: "http://cam.qcloud.com/groups/global/AllUsers"},
		Permission: "READ",
	})
	if aclIsPrivate(value) {
		t.Fatal("AllUsers ACL must not be private")
	}
}

func TestPolicyPublicAccessFailsClosed(t *testing.T) {
	private := &bucketPolicy{Statements: []bucketPolicyStatement{{
		Effect:    "allow",
		Principal: json.RawMessage(`{"qcs":["qcs::cam::uin/1250000000:uin/1250000000"]}`),
	}}}
	if policyAllowsPublic(private) {
		t.Fatal("account-bound policy should not be classified public")
	}
	public := &bucketPolicy{Statements: []bucketPolicyStatement{{
		Effect:    "allow",
		Principal: json.RawMessage(`{"qcs":["*"]}`),
	}}}
	if !policyAllowsPublic(public) {
		t.Fatal("wildcard principal must be classified public")
	}
	malformed := &bucketPolicy{Statements: []bucketPolicyStatement{{
		Effect:    "allow",
		Principal: json.RawMessage(`{"qcs":`),
	}}}
	if !policyAllowsPublic(malformed) {
		t.Fatal("malformed allow principal must fail closed as public")
	}
}

func TestAuthorizationMatchesTencentSDKFixedVector(t *testing.T) {
	request, err := http.NewRequest(
		http.MethodPut,
		"http://testbucket-125000000.cos.ap-guangzhou.myqcloud.com/testfile2",
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Host = "testbucket-125000000.cos.ap-guangzhou.myqcloud.com"
	request.Header.Add("x-cos-content-sha1", "db8ac1c259eb89d4a131b253bacfca5f319d54f2")
	request.Header.Add("x-cos-stroage-class", "nearline")
	credentials := credentialEnvelope{
		SecretID:  "QmFzZTY0IGlzIGEgZ2VuZXJp",
		SecretKey: "AKIDZfbOA78asKUYBcXFrJD0a1ICvR98JM",
	}
	start := time.Unix(1480932292, 0)
	end := time.Unix(1481012292, 0)
	want := "q-sign-algorithm=sha1&q-ak=QmFzZTY0IGlzIGEgZ2VuZXJp&q-sign-time=1480932292;1481012292&q-key-time=1480932292;1481012292&q-header-list=host;x-cos-content-sha1;x-cos-stroage-class&q-url-param-list=&q-signature=ce4ac0ecbcdb30538b3fee0a97cc6389694ce53a"
	if got := authorization(credentials, request, start, end); got != want {
		t.Fatalf("authorization mismatch\ngot:  %s\nwant: %s", got, want)
	}
}

func TestArchiveSchemasRemainExplicit(t *testing.T) {
	if credentialSchema == archiveSchema || credentialSchema == "" || archiveSchema == "" {
		t.Fatal("credential and archive facts must use distinct explicit schemas")
	}
}

func TestProductionClientDisablesProxyAndRequiresTLS12(t *testing.T) {
	client, err := newClient(validCredentials(time.Now().UTC()))
	if err != nil {
		t.Fatal(err)
	}
	transport, ok := client.http.Transport.(*http.Transport)
	if !ok {
		t.Fatal("production client transport is not explicit")
	}
	if transport.Proxy != nil || !transport.DisableCompression {
		t.Fatal("production client must disable proxy inheritance and transparent compression")
	}
	if transport.TLSClientConfig == nil || transport.TLSClientConfig.MinVersion != tls.VersionTLS12 {
		t.Fatal("production client must require TLS 1.2 or newer")
	}
}

func TestTransportFailureDoesNotExposeDestination(t *testing.T) {
	credentials := validCredentials(time.Now().UTC())
	endpoint, err := url.Parse("https://" + credentials.Grant.Bucket + ".cos.ap-hongkong.myqcloud.com")
	if err != nil {
		t.Fatal(err)
	}
	client := &cosClient{
		credentials: credentials,
		endpoint:    endpoint,
		http: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			return nil, fmt.Errorf("dial failed for %s with sensitive diagnostic", request.URL.String())
		})},
	}
	_, err = client.request(context.Background(), http.MethodGet, "/"+credentials.Grant.ObjectKey, nil, nil, nil, -1)
	if err == nil {
		t.Fatal("transport failure must be returned")
	}
	for _, forbidden := range []string{
		credentials.Grant.Bucket,
		credentials.Grant.ObjectKey,
		"sensitive diagnostic",
		"https://",
	} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("transport error exposed destination material: %s", forbidden)
		}
	}
}

func TestArchiveEvidenceDigestExcludesDigestFieldAndUsesCanonicalOrder(t *testing.T) {
	offHost := offHostFacts{ArchiveVerified: true, Provider: "TENCENT_COS"}
	unsigned := struct {
		OffHost       offHostFacts `json:"offHost"`
		SchemaVersion string       `json:"schemaVersion"`
	}{OffHost: offHost, SchemaVersion: archiveSchema}
	digest, err := digestJSON(unsigned)
	if err != nil {
		t.Fatal(err)
	}
	if digest != "sha256:95693fe5baec51764c84f3b20432cfae886b401b20ad97bd253e705a63060232" {
		t.Fatalf("canonical archive digest drifted: %s", digest)
	}
}

func TestBucketVerificationRejectsMultiAZ(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodHead || request.URL.Path != "/" {
			t.Errorf("unexpected request after multi-AZ detection: %s %s", request.Method, request.URL.Path)
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		writer.Header().Set("x-cos-bucket-region", "ap-hongkong")
		writer.Header().Set("x-cos-bucket-az-type", "MAZ")
	}))
	defer server.Close()

	now := time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC)
	credentials := validCredentials(now)
	endpoint, _ := url.Parse(server.URL)
	client := &cosClient{credentials: credentials, endpoint: endpoint, http: server.Client()}
	_, err := verifyBucket(context.Background(), client, credentials, validPlan(now))
	if err == nil || !strings.Contains(err.Error(), "multi-AZ") {
		t.Fatalf("multi-AZ bucket was not rejected: %v", err)
	}
}

func TestArchiveRejectsPreexistingObjectWithoutUpload(t *testing.T) {
	putCount := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		query := request.URL.Query()
		switch {
		case request.Method == http.MethodHead && request.URL.Path == "/":
			writer.Header().Set("x-cos-bucket-region", "ap-hongkong")
		case request.Method == http.MethodGet && request.URL.Path == "/" && query.Has("acl"):
			fmt.Fprint(writer, `<AccessControlPolicy><Owner><ID>owner</ID></Owner><AccessControlList><Grant><Grantee><ID>owner</ID></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`)
		case request.Method == http.MethodGet && request.URL.Path == "/" && query.Has("policy"):
			writer.WriteHeader(http.StatusNotFound)
			fmt.Fprint(writer, `<Error><Code>NoSuchBucketPolicy</Code></Error>`)
		case request.Method == http.MethodGet && request.URL.Path == "/" && query.Has("versioning"):
			fmt.Fprint(writer, `<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>`)
		case request.Method == http.MethodGet && request.URL.Path == "/" && query.Has("object-lock"):
			fmt.Fprint(writer, `<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled><Rule><DefaultRetention><Mode>COMPLIANCE</Mode><Days>31</Days></DefaultRetention></Rule></ObjectLockConfiguration>`)
		case request.Method == http.MethodHead:
			writer.Header().Set("Content-Length", "1")
		case request.Method == http.MethodPut:
			putCount++
		default:
			t.Errorf("unexpected COS request: %s %s", request.Method, request.URL.String())
			writer.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer server.Close()

	now := time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC)
	credentials := validCredentials(now)
	endpoint, _ := url.Parse(server.URL)
	client := &cosClient{credentials: credentials, endpoint: endpoint, http: server.Client()}
	directory := t.TempDir()
	input := filepath.Join(directory, "production.dump.age")
	output := filepath.Join(directory, "retrieved.dump.age")
	if err := os.WriteFile(input, []byte("encrypted"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := archiveWithClient(context.Background(), client, credentials, validPlan(now), input, output)
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("preexisting object was not rejected: %v", err)
	}
	if putCount != 0 {
		t.Fatal("archive uploaded after detecting a preexisting object")
	}
}

func TestBucketPrivacyAndDefaultRetentionFailClosed(t *testing.T) {
	ownerOnly := &aclDocument{
		Owner: &aclOwner{ID: "owner"},
		Grants: []aclGrant{{
			Grantee:    &aclGrantee{ID: "owner"},
			Permission: "FULL_CONTROL",
		}},
	}
	if !aclIsPrivate(ownerOnly) {
		t.Fatal("owner-only FULL_CONTROL ACL must be private")
	}
	thirdParty := &aclDocument{
		Owner: &aclOwner{ID: "owner"},
		Grants: []aclGrant{
			{Grantee: &aclGrantee{ID: "owner"}, Permission: "FULL_CONTROL"},
			{Grantee: &aclGrantee{ID: "other-account"}, Permission: "READ"},
		},
	}
	if aclIsPrivate(thirdParty) {
		t.Fatal("third-party ACL grant must not be reported as private")
	}
	if !objectLockMeetsPolicy(objectLockDocument{Enabled: "Enabled", Mode: "COMPLIANCE", Days: 30}) {
		t.Fatal("30-day COMPLIANCE default retention must pass")
	}
	for _, value := range []objectLockDocument{
		{Enabled: "Enabled", Mode: "", Days: 30},
		{Enabled: "Enabled", Mode: "GOVERNANCE", Days: 30},
		{Enabled: "Enabled", Mode: "COMPLIANCE", Days: 29},
		{Enabled: "Disabled", Mode: "COMPLIANCE", Days: 30},
	} {
		if objectLockMeetsPolicy(value) {
			t.Fatalf("weak object lock policy passed: %+v", value)
		}
	}
}

func TestArchiveWithClientVerifiesExactPrivateVersionedRetentionRoundTrip(t *testing.T) {
	payload := []byte("encrypted-pg-dump-fixture")
	versionID := "version-0001"
	retentionUntil := time.Now().UTC().Add(31 * 24 * time.Hour).Format(time.RFC3339)
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") == "" || request.Header.Get("x-cos-security-token") == "" {
			t.Error("signed temporary-credential headers are required")
		}
		query := request.URL.Query()
		switch {
		case request.Method == http.MethodHead && request.URL.Path == "/":
			writer.Header().Set("x-cos-bucket-region", "ap-hongkong")
		case request.Method == http.MethodGet && request.URL.Path == "/" && query.Has("acl"):
			fmt.Fprint(writer, `<AccessControlPolicy><Owner><ID>owner</ID></Owner><AccessControlList><Grant><Grantee><ID>owner</ID></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`)
		case request.Method == http.MethodGet && request.URL.Path == "/" && query.Has("policy"):
			writer.WriteHeader(http.StatusNotFound)
			fmt.Fprint(writer, `<Error><Code>NoSuchBucketPolicy</Code></Error>`)
		case request.Method == http.MethodGet && request.URL.Path == "/" && query.Has("versioning"):
			fmt.Fprint(writer, `<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>`)
		case request.Method == http.MethodGet && request.URL.Path == "/" && query.Has("object-lock"):
			fmt.Fprint(writer, `<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled><Rule><DefaultRetention><Mode>COMPLIANCE</Mode><Days>31</Days></DefaultRetention></Rule></ObjectLockConfiguration>`)
		case request.Method == http.MethodHead && request.URL.Path != "/" && !query.Has("versionId"):
			writer.WriteHeader(http.StatusNotFound)
		case request.Method == http.MethodPut:
			if request.Header.Get("x-cos-acl") != "private" ||
				request.Header.Get("x-cos-forbid-overwrite") != "true" ||
				request.Header.Get("x-cos-server-side-encryption") != "AES256" ||
				request.Header.Get("x-cos-object-lock-mode") != "COMPLIANCE" {
				t.Error("secure upload headers are incomplete")
			}
			body, _ := io.ReadAll(request.Body)
			if string(body) != string(payload) {
				t.Error("uploaded payload mismatch")
			}
			writer.Header().Set("x-cos-version-id", versionID)
		case request.Method == http.MethodGet && query.Has("acl"):
			if query.Get("versionId") != versionID {
				t.Error("object ACL did not bind exact version")
			}
			fmt.Fprint(writer, `<AccessControlPolicy><Owner><ID>owner</ID></Owner><AccessControlList><Grant><Grantee><ID>owner</ID></Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`)
		case request.Method == http.MethodGet && query.Has("retention"):
			if query.Get("versionId") != versionID {
				t.Error("retention did not bind exact version")
			}
			fmt.Fprintf(writer, `<Retention><Mode>COMPLIANCE</Mode><RetainUntilDate>%s</RetainUntilDate></Retention>`, retentionUntil)
		case request.Method == http.MethodHead:
			writer.Header().Set("Content-Length", fmt.Sprint(len(payload)))
			writer.Header().Set("x-cos-server-side-encryption", "AES256")
		case request.Method == http.MethodGet:
			if query.Get("versionId") != versionID {
				t.Error("retrieval did not bind exact version")
			}
			_, _ = writer.Write(payload)
		default:
			t.Errorf("unexpected COS request: %s %s", request.Method, request.URL.String())
			writer.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer server.Close()

	now := time.Now().UTC()
	credentials := validCredentials(now)
	plan := validPlan(now)
	endpoint, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client := &cosClient{credentials: credentials, endpoint: endpoint, http: server.Client()}
	directory := t.TempDir()
	input := filepath.Join(directory, "production.dump.age")
	output := filepath.Join(directory, "retrieved.dump.age")
	if err := os.WriteFile(input, payload, 0o600); err != nil {
		t.Fatal(err)
	}
	evidence, err := archiveWithClient(context.Background(), client, credentials, plan, input, output)
	if err != nil {
		t.Fatal(err)
	}
	if !evidence.OffHost.ArchiveVerified || !evidence.OffHost.ChecksumVerified ||
		evidence.OffHost.ObjectRetentionMode != "COMPLIANCE" ||
		evidence.OffHost.ObjectVersionIdentityDigest == "" ||
		evidence.OffHost.AvailabilityZoneType != "SINGLE_AZ" ||
		!evidence.OffHost.PreUploadObjectAbsent ||
		evidence.OffHost.ProvisioningPlanDigest != plan.PlanDigest {
		t.Fatalf("archive evidence is incomplete: %+v", evidence.OffHost)
	}
	retrieved, err := os.ReadFile(output)
	if err != nil || string(retrieved) != string(payload) {
		t.Fatal("retrieved encrypted backup mismatch")
	}
	encoded, err := json.Marshal(evidence)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{credentials.SecretID, credentials.SecretKey, credentials.SessionToken, credentials.Grant.Bucket, credentials.Grant.ObjectKey} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("archive evidence exposed sensitive destination material: %s", forbidden)
		}
	}
}
