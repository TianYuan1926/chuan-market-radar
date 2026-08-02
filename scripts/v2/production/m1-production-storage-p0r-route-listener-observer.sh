#!/usr/bin/env bash
set -euo pipefail

readonly SCHEMA_VERSION="market-radar-v2-m1-p0r-remote-listener-observation.v1"
readonly LISTENER_UNIT="market-radar-p0r-8022.service"
readonly LISTENER_PORT="8022"

fail() {
  printf '{"containsSecret":false,"reason":"%s","status":"BLOCKED_P0R_ROUTE_LISTENER_OBSERVER"}\n' "$1" >&2
  exit 1
}

for binary in /usr/bin/date /usr/bin/hostname /usr/bin/ss /usr/bin/systemctl /usr/bin/sudo; do
  [[ -x "$binary" ]] || fail "listener_observer_binary_unavailable"
done

declare load_state=""
declare active_state=""
declare sub_state=""
declare main_pid=""
declare property_count=0
while IFS='=' read -r key value; do
  case "$key" in
    LoadState)
      [[ -z "$load_state" ]] || fail "listener_observer_unit_property_repeated"
      load_state="$value"
      ;;
    ActiveState)
      [[ -z "$active_state" ]] || fail "listener_observer_unit_property_repeated"
      active_state="$value"
      ;;
    SubState)
      [[ -z "$sub_state" ]] || fail "listener_observer_unit_property_repeated"
      sub_state="$value"
      ;;
    MainPID)
      [[ -z "$main_pid" ]] || fail "listener_observer_unit_property_repeated"
      main_pid="$value"
      ;;
    *) fail "listener_observer_unit_property_unexpected" ;;
  esac
  property_count=$((property_count + 1))
done < <(/usr/bin/sudo -n /usr/bin/systemctl show \
  --no-pager \
  --property=LoadState \
  --property=ActiveState \
  --property=SubState \
  --property=MainPID \
  "$LISTENER_UNIT")

[[ "$property_count" -eq 4 ]] || fail "listener_observer_unit_property_count_invalid"
[[ "$load_state" == "loaded" ]] || fail "listener_observer_unit_not_loaded"
[[ "$active_state" == "active" ]] || fail "listener_observer_unit_not_active"
[[ "$sub_state" == "running" ]] || fail "listener_observer_unit_not_running"
[[ "$main_pid" =~ ^[1-9][0-9]*$ ]] || fail "listener_observer_main_pid_invalid"

mapfile -t ipv4_lines < <(/usr/bin/sudo -n /usr/bin/ss -H -l -n -p -t -4 "sport = :$LISTENER_PORT")
mapfile -t ipv6_lines < <(/usr/bin/sudo -n /usr/bin/ss -H -l -n -p -t -6 "sport = :$LISTENER_PORT")
[[ "${#ipv4_lines[@]}" -eq 1 ]] || fail "listener_observer_ipv4_count_invalid"
[[ "${#ipv6_lines[@]}" -eq 0 ]] || fail "listener_observer_ipv6_count_invalid"

readonly socket_line="${ipv4_lines[0]}"
read -r socket_state _ _ listener_local_address _ socket_process <<<"$socket_line"
[[ "$socket_state" == "LISTEN" ]] || fail "listener_observer_socket_state_invalid"
if [[ "$listener_local_address" != "0.0.0.0:$LISTENER_PORT" \
  && "$listener_local_address" != "43.161.202.227:$LISTENER_PORT" ]]; then
  fail "listener_observer_local_address_invalid"
fi
[[ "$socket_process" == *'"sshd"'* ]] || fail "listener_observer_process_invalid"
[[ "$socket_process" == *"pid=$main_pid,"* ]] || fail "listener_observer_process_pid_mismatch"

readonly hostname_value="$(/usr/bin/hostname)"
[[ "$hostname_value" =~ ^[A-Za-z0-9._-]{1,253}$ ]] || fail "listener_observer_hostname_invalid"
readonly checked_at="$(/usr/bin/date -u +%Y-%m-%dT%H:%M:%S.000Z)"

printf '{"activeState":"active","checkedAt":"%s","containsSecret":false,"hostname":"%s","ipv4ListenerCount":1,"ipv6ListenerCount":0,"listenerLocalAddress":"%s","listenerPort":8022,"listenerProcessName":"sshd","listenerProcessPid":%s,"listenerUnit":"%s","loadState":"loaded","mainPid":%s,"schemaVersion":"%s","subState":"running"}\n' \
  "$checked_at" \
  "$hostname_value" \
  "$listener_local_address" \
  "$main_pid" \
  "$LISTENER_UNIT" \
  "$main_pid" \
  "$SCHEMA_VERSION"
