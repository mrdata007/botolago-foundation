#!/usr/bin/env python3
"""Staging-only distributed Phase 6 capacity gate orchestrator.

Secrets are read from an owner-only runtime file, retained only in process
memory, and never written to reports or command arguments. The temporary
Supabase Secret API key and every EC2 resource are removed in ``finally``.
"""

from __future__ import annotations

import concurrent.futures
import json
import math
import os
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_FILE = Path("/private/tmp/botolago-phase6/runtime.env")
STATE_FILE = Path("/private/tmp/botolago-phase6/cloud-state.json")
ARTIFACT_ROOT = Path("/private/tmp/botolago-phase6/evidence")
RUNNER_COUNT = 5
USERS_PER_RUNNER = 500
TOTAL_USERS = RUNNER_COUNT * USERS_PER_RUNNER
FIRST_USER_NUMBER = 50_001
LAST_USER_NUMBER = FIRST_USER_NUMBER + TOTAL_USERS - 1
# Supabase Management API key names accept lowercase alphanumerics and
# underscores only; the requested display name used hyphens.
TEMP_KEY_NAME = "phase6_fantasy_metrics"
USER_AGENT = "botolago-phase6-capacity-gate/1.0"
SEASON_ID = "fa630000-0000-4000-8000-000000000001"
GAMEWEEK_ID = "fa640000-0000-4000-8000-000000000002"
EXPECTED_RUNTIME_KEYS = {
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_STAGING_PROJECT_REF",
    "SUPABASE_STAGING_URL",
    "SUPABASE_STAGING_PUBLISHABLE_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_REGION",
}


def event(message: str) -> None:
    print(f"[{datetime.now(UTC).isoformat()}] {message}", flush=True)


def private_write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(value)


def private_json(path: Path, value: Any) -> None:
    private_write(path, json.dumps(value, indent=2, sort_keys=True) + "\n")


def read_runtime(path: Path) -> dict[str, str]:
    if not path.is_file() or path.stat().st_mode & 0o077:
        raise RuntimeError("runtime credential file must exist with mode 0600")
    values: dict[str, str] = {}
    for number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise RuntimeError(f"runtime credential line {number} is malformed")
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if name not in EXPECTED_RUNTIME_KEYS or not value or name in values:
            raise RuntimeError(f"runtime credential line {number} is invalid")
        values[name] = value
    required = EXPECTED_RUNTIME_KEYS - {"AWS_SESSION_TOKEN"}
    missing = required - values.keys()
    if missing:
        raise RuntimeError("runtime credential file is missing required keys")
    project_ref = values["SUPABASE_STAGING_PROJECT_REF"]
    if values["SUPABASE_STAGING_URL"] != f"https://{project_ref}.supabase.co":
        raise RuntimeError("staging project reference and URL do not match")
    if not values["SUPABASE_STAGING_PUBLISHABLE_KEY"].startswith("sb_publishable_"):
        raise RuntimeError("a staging publishable key is required")
    return values


def http_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    body: Any | None = None,
    timeout: int = 30,
) -> Any:
    request_headers = {"User-Agent": USER_AGENT, "Accept": "application/json", **headers}
    payload = None
    if body is not None:
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url, data=payload, headers=request_headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw_error = error.read()
        detail = ""
        try:
            parsed_error = json.loads(raw_error)
            if isinstance(parsed_error, dict):
                candidate = parsed_error.get("message") or parsed_error.get("error")
                if (
                    isinstance(candidate, str)
                    and "sb_" not in candidate
                    and "Bearer " not in candidate
                    and len(candidate) <= 300
                ):
                    detail = f": {candidate}"
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
        raise RuntimeError(f"remote API returned HTTP {error.code}{detail}") from error


def percentile(values: list[float], percent: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(percent / 100 * len(ordered)) - 1))
    return round(ordered[index], 3)


def safe_runner_diagnostic(value: str) -> str:
    normalized = " ".join(value.split())
    forbidden = ("sb_", "Bearer ", "access_token", "refresh_token", "password")
    if any(token in normalized for token in forbidden):
        return "runner diagnostic redacted because it contained credential-like text"
    return normalized[-1000:] or "runner emitted no diagnostic"


class CapacityGate:
    def __init__(self) -> None:
        self.runtime = read_runtime(RUNTIME_FILE)
        self.project_ref = self.runtime["SUPABASE_STAGING_PROJECT_REF"]
        self.supabase_url = self.runtime["SUPABASE_STAGING_URL"].rstrip("/")
        self.run_id = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        self.artifact_dir = ARTIFACT_ROOT / self.run_id
        self.artifact_dir.mkdir(parents=True, exist_ok=False, mode=0o700)
        self.temp_secret: str | None = None
        self.temp_key_id: str | None = None
        self.users: list[dict[str, Any]] = []
        self.passwords: dict[int, str] = {}
        self.user_creation_stats = Counter()
        self.instance_ids: list[str] = []
        self.instance_ips: list[str] = []
        self.security_group_id: str | None = None
        self.key_pair_name: str | None = None
        self.key_path: Path | None = None
        self.metrics_process: subprocess.Popen[str] | None = None
        self.metrics_summary: dict[str, Any] | None = None
        self.sql_samples: list[dict[str, Any]] = []
        self.sql_sampler_stop = threading.Event()
        self.sql_sampler_thread: threading.Thread | None = None
        self.original_gameweek: dict[str, Any] | None = None
        self.gameweek_prepared = False
        self.cloud_mutation_started = False
        aws = {
            "aws_access_key_id": self.runtime["AWS_ACCESS_KEY_ID"],
            "aws_secret_access_key": self.runtime["AWS_SECRET_ACCESS_KEY"],
            "region_name": self.runtime["AWS_REGION"],
        }
        if "AWS_SESSION_TOKEN" in self.runtime:
            aws["aws_session_token"] = self.runtime["AWS_SESSION_TOKEN"]
        session = boto3.Session(**aws)
        config = Config(retries={"max_attempts": 8, "mode": "standard"})
        self.ec2 = session.client("ec2", config=config)
        self.ssm = session.client("ssm", config=config)
        self.sts = session.client("sts", config=config)

    @property
    def management_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.runtime['SUPABASE_ACCESS_TOKEN']}"}

    def management(self, method: str, path: str, body: Any | None = None) -> Any:
        return http_json(
            method,
            f"https://api.supabase.com{path}",
            headers=self.management_headers,
            body=body,
            timeout=60,
        )

    def sql(self, query: str) -> Any:
        return self.management(
            "POST",
            f"/v1/projects/{self.project_ref}/database/query",
            {"query": query},
        )

    def preflight(self) -> None:
        identity = self.sts.get_caller_identity()
        if not identity.get("Account") or not identity.get("Arn"):
            raise RuntimeError("AWS identity validation failed")
        project = self.management("GET", f"/v1/projects/{self.project_ref}")
        project_name = str(project.get("name", "")) if isinstance(project, dict) else ""
        if "staging" not in project_name.lower():
            raise RuntimeError("Supabase project is not explicitly named as staging")
        rows = self.sql(
            "select id::text, fantasy_season_id::text, name, status::text, "
            "points_state::text, deadline_at, finalized_at, "
            "deadline_at > statement_timestamp() as deadline_future "
            f"from app.fantasy_gameweeks where id = '{GAMEWEEK_ID}'::uuid"
        )
        row = rows[0] if isinstance(rows, list) and rows else {}
        if (
            row.get("id") != GAMEWEEK_ID
            or row.get("fantasy_season_id") != SEASON_ID
            or row.get("name") != "Capacity GW2"
        ):
            raise RuntimeError("staging capacity gameweek identity validation failed")
        self.original_gameweek = row
        existing = self.sql(
            "select count(*)::integer as users from auth.users "
            "where email like 'fantasy-gate-%@staging.botolago.invalid'"
        )
        if existing[0]["users"] != 0:
            raise RuntimeError("stale Phase 6 temporary Auth users require cleanup")
        active_runners = self.ec2.describe_instances(
            Filters=[
                {"Name": "tag:Purpose", "Values": ["botolago-phase6"]},
                {
                    "Name": "instance-state-name",
                    "Values": ["pending", "running", "stopping", "stopped"],
                },
            ]
        )
        count = sum(len(item["Instances"]) for item in active_runners["Reservations"])
        stale_groups = self.ec2.describe_security_groups(
            Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
        )["SecurityGroups"]
        stale_keys = self.ec2.describe_key_pairs(
            Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
        )["KeyPairs"]
        if count or stale_groups or stale_keys:
            raise RuntimeError("stale Phase 6 AWS resources require cleanup")
        event("Preflight passed: target is Staging V2 and capacity data is isolated")

    def prepare_capacity_gameweek(self) -> None:
        if not self.original_gameweek:
            raise RuntimeError("capacity gameweek state was not captured")
        if (
            self.original_gameweek.get("status") == "open"
            and self.original_gameweek.get("deadline_future") is True
        ):
            return
        self.sql(
            "update app.fantasy_gameweeks set status = 'open', "
            "points_state = 'provisional', finalized_at = null, "
            "deadline_at = '2090-01-01T10:30:00Z'::timestamptz "
            f"where id = '{GAMEWEEK_ID}'::uuid and name = 'Capacity GW2' "
            f"and fantasy_season_id = '{SEASON_ID}'::uuid"
        )
        check = self.sql(
            "select status::text, deadline_at > statement_timestamp() as deadline_future "
            f"from app.fantasy_gameweeks where id = '{GAMEWEEK_ID}'::uuid"
        )[0]
        if check.get("status") != "open" or check.get("deadline_future") is not True:
            raise RuntimeError("synthetic capacity gameweek preparation failed")
        self.gameweek_prepared = True
        event("Temporarily reopened the isolated synthetic capacity gameweek")

    def restore_capacity_gameweek(self) -> None:
        if not self.gameweek_prepared or not self.original_gameweek:
            return
        encoded = json.dumps(
            {
                "status": self.original_gameweek["status"],
                "points_state": self.original_gameweek["points_state"],
                "deadline_at": self.original_gameweek["deadline_at"],
                "finalized_at": self.original_gameweek["finalized_at"],
            },
            separators=(",", ":"),
        ).replace("'", "''")
        self.sql(
            "with original as (select * from jsonb_to_record("
            f"'{encoded}'::jsonb) as value(status app.fantasy_gameweek_status, "
            "points_state app.fantasy_points_state, deadline_at timestamptz, "
            "finalized_at timestamptz)) update app.fantasy_gameweeks gameweek set "
            "status = original.status, points_state = original.points_state, "
            "deadline_at = original.deadline_at, finalized_at = original.finalized_at "
            f"from original where gameweek.id = '{GAMEWEEK_ID}'::uuid"
        )
        self.gameweek_prepared = False
        event("Restored the synthetic capacity gameweek to its original state")

    def create_temporary_key(self) -> None:
        keys = self.management("GET", f"/v1/projects/{self.project_ref}/api-keys")
        if isinstance(keys, list) and any(item.get("name") == TEMP_KEY_NAME for item in keys):
            raise RuntimeError("a temporary metrics key with the requested name already exists")
        result = self.management(
            "POST",
            f"/v1/projects/{self.project_ref}/api-keys?reveal=true",
            {
                "type": "secret",
                "name": TEMP_KEY_NAME,
                "description": "Temporary Phase 6 staging capacity metrics key",
            },
        )
        if not isinstance(result, dict):
            raise RuntimeError("temporary key creation returned an invalid response")
        self.temp_key_id = str(result.get("id") or result.get("key_id") or "")
        secret_value = result.get("api_key") or result.get("key")
        if not self.temp_key_id or not isinstance(secret_value, str):
            raise RuntimeError("temporary key creation omitted its identifier or value")
        if not secret_value.startswith("sb_secret_"):
            raise RuntimeError("temporary key is not a Secret API key")
        self.temp_secret = secret_value
        self.cloud_mutation_started = True
        time.sleep(5)
        event("Created the temporary staging Metrics API key in process memory")

    def delete_temporary_key(self) -> None:
        if not self.temp_key_id:
            return
        try:
            self.management(
                "DELETE",
                f"/v1/projects/{self.project_ref}/api-keys/{self.temp_key_id}"
                "?reason=phase6_capacity_gate_complete",
            )
            event("Deleted the temporary staging Metrics API key")
        finally:
            self.temp_secret = None
            self.temp_key_id = None

    def auth_admin(self, method: str, path: str, body: Any | None = None) -> Any:
        if not self.temp_secret:
            raise RuntimeError("temporary Secret API key is unavailable")
        return http_json(
            method,
            f"{self.supabase_url}/auth/v1{path}",
            headers={"apikey": self.temp_secret},
            body=body,
            timeout=30,
        )

    def create_users(self) -> None:
        event("Creating 2,500 isolated temporary staging users")
        rate_lock = threading.Lock()
        stats_lock = threading.Lock()
        next_request_at = [time.monotonic()]

        def create_one(number: int) -> dict[str, Any]:
            email = (
                f"fantasy-gate-{self.run_id}-{number}@staging.botolago.invalid"
            )
            password = secrets.token_urlsafe(32)
            last_error: Exception | None = None
            for attempt in range(3):
                with rate_lock:
                    request_at = next_request_at[0]
                    next_request_at[0] += 0.2
                time.sleep(max(0.0, request_at - time.monotonic()))
                try:
                    with stats_lock:
                        self.user_creation_stats["adminRequests"] += 1
                    response = self.auth_admin(
                        "POST",
                        "/admin/users",
                        {"email": email, "password": password, "email_confirm": True},
                    )
                    user_id = response.get("id") if isinstance(response, dict) else None
                    uuid.UUID(str(user_id))
                    return {
                        "number": number,
                        "email": email,
                        "password": password,
                        "user_id": str(user_id),
                    }
                except Exception as error:
                    last_error = error
                    with stats_lock:
                        self.user_creation_stats["ambiguousResponses"] += 1
                    safe_email = email.replace("'", "''")
                    existing = self.sql(
                        "select id::text from auth.users "
                        f"where email = '{safe_email}' limit 2"
                    )
                    if len(existing) == 1:
                        with stats_lock:
                            self.user_creation_stats["reconciledByEmail"] += 1
                        uuid.UUID(str(existing[0]["id"]))
                        return {
                            "number": number,
                            "email": email,
                            "password": password,
                            "user_id": str(existing[0]["id"]),
                        }
                    if attempt < 2:
                        with stats_lock:
                            self.user_creation_stats["safeRetries"] += 1
                        time.sleep(2**attempt)
            raise RuntimeError("temporary Auth user creation exhausted retries") from last_error

        failures: list[str] = []
        numbers = range(FIRST_USER_NUMBER, LAST_USER_NUMBER + 1)
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(create_one, number) for number in numbers]
            for future in concurrent.futures.as_completed(futures):
                try:
                    record = future.result()
                except Exception as error:
                    failures.append(type(error).__name__)
                    continue
                self.users.append(record)
                self.passwords[record["number"]] = record["password"]
                if len(self.users) % 250 == 0:
                    event(f"Temporary staging users created: {len(self.users)}/2500")
        if failures:
            failure_types = ", ".join(
                f"{name}={count}" for name, count in sorted(Counter(failures).items())
            )
            raise RuntimeError(
                f"temporary Auth user creation failed for {len(failures)} users "
                f"({failure_types})"
            )
        if len({item["user_id"] for item in self.users}) != TOTAL_USERS:
            raise RuntimeError("temporary Auth user IDs are not unique")
        self.users.sort(key=lambda item: item["number"])
        event("Created 2,500 unique temporary Auth users")

    def seed_user_fantasy_state(self) -> None:
        safe_users = [
            {"number": item["number"], "user_id": item["user_id"]}
            for item in self.users
        ]
        encoded = json.dumps(safe_users, separators=(",", ":")).replace("'", "''")
        query = f"""
begin;
create temporary table phase6_gate_users(number integer primary key, user_id uuid unique)
on commit drop;
insert into phase6_gate_users
select number, user_id from jsonb_to_recordset('{encoded}'::jsonb)
as item(number integer, user_id uuid);

insert into app.profiles (id, display_name, preferred_language)
select user_id, 'Phase 6 Gate User ' || number, 'fr'
from phase6_gate_users on conflict (id) do nothing;

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name,
  bank, team_value, free_transfers, version, status
)
select md5('fantasy-load-team-' || number)::uuid, user_id,
  '{SEASON_ID}'::uuid, '{GAMEWEEK_ID}'::uuid,
  'Gate Team ' || number, 10.0, 90.0, 1, 1, 'active'
from phase6_gate_users;

insert into app.fantasy_squad_memberships (
  id, fantasy_team_id, fantasy_player_id, purchase_price,
  current_sale_price, acquired_gameweek_id
)
select md5('fantasy-gate-membership-' || gate.number || '-' || player)::uuid,
  md5('fantasy-load-team-' || gate.number)::uuid,
  md5('fantasy-load-player-' || player)::uuid,
  6.0, 6.0, 'fa640000-0000-4000-8000-000000000001'::uuid
from phase6_gate_users gate cross join generate_series(1, 15) player;

insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version)
select md5('fantasy-gate-lineup-' || number)::uuid,
  md5('fantasy-load-team-' || number)::uuid, '{GAMEWEEK_ID}'::uuid, 1
from phase6_gate_users;

insert into app.fantasy_lineup_players (
  lineup_id, fantasy_player_id, slot, slot_order, captain,
  vice_captain, multiplier, snapshot_price
)
select md5('fantasy-gate-lineup-' || gate.number)::uuid,
  md5('fantasy-load-player-' || player)::uuid,
  case when player in (1,3,4,5,6,9,10,11,12,13,14)
    then 'starter'::app.fantasy_lineup_slot
    else 'bench'::app.fantasy_lineup_slot end,
  case player
    when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
    when 9 then 6 when 10 then 7 when 11 then 8 when 12 then 9
    when 13 then 10 when 14 then 11 when 2 then 1 when 7 then 2
    when 8 then 3 when 15 then 4 end,
  player = 9, player = 13, case when player = 9 then 2 else 1 end, 6.0
from phase6_gate_users gate cross join generate_series(1, 15) player;
commit;
"""
        self.sql(query)
        validation = self.sql(
            "select count(*)::integer as teams, "
            "count(*) filter (where squad_count = 15)::integer as valid_squads "
            "from (select team.id, count(membership.id) as squad_count "
            "from app.fantasy_teams team left join app.fantasy_squad_memberships membership "
            "on membership.fantasy_team_id = team.id and membership.sold_at is null "
            f"where team.name like 'Gate Team %' and team.user_id in "
            f"(select id from auth.users where email like 'fantasy-gate-{self.run_id}-%') "
            "group by team.id) checked"
        )[0]
        if validation != {"teams": TOTAL_USERS, "valid_squads": TOTAL_USERS}:
            raise RuntimeError("temporary Fantasy state validation failed")
        event("Seeded 2,500 isolated valid Fantasy teams")

    def _coordinator_ip(self) -> str:
        request = urllib.request.Request(
            "https://checkip.amazonaws.com", headers={"User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            value = response.read().decode("ascii").strip()
        parts = value.split(".")
        if len(parts) != 4 or any(not part.isdigit() for part in parts):
            raise RuntimeError("unable to validate coordinator IPv4 address")
        return value

    def provision_runners(self) -> None:
        event("Provisioning five temporary AWS runners with distinct public IPv4 addresses")
        vpcs = self.ec2.describe_vpcs(Filters=[{"Name": "is-default", "Values": ["true"]}])[
            "Vpcs"
        ]
        if len(vpcs) != 1:
            raise RuntimeError("AWS region must have exactly one default VPC")
        vpc_id = vpcs[0]["VpcId"]
        subnets = self.ec2.describe_subnets(
            Filters=[
                {"Name": "vpc-id", "Values": [vpc_id]},
                {"Name": "map-public-ip-on-launch", "Values": ["true"]},
            ]
        )["Subnets"]
        if not subnets:
            raise RuntimeError("default VPC has no public-IP subnet")
        subnet_id = sorted(subnets, key=lambda item: item["AvailabilityZone"])[0]["SubnetId"]

        self.key_pair_name = f"botolago-phase6-{self.run_id}"
        key = self.ec2.create_key_pair(
            KeyName=self.key_pair_name,
            TagSpecifications=[{
                "ResourceType": "key-pair",
                "Tags": [{"Key": "Purpose", "Value": "botolago-phase6"}],
            }],
        )
        self.key_path = self.artifact_dir / "runner.pem"
        private_write(self.key_path, key["KeyMaterial"])

        group = self.ec2.create_security_group(
            GroupName=f"botolago-phase6-{self.run_id}",
            Description="Temporary Phase 6 load-runner SSH ingress",
            VpcId=vpc_id,
            TagSpecifications=[{
                "ResourceType": "security-group",
                "Tags": [{"Key": "Purpose", "Value": "botolago-phase6"}],
            }],
        )
        self.security_group_id = group["GroupId"]
        self.ec2.authorize_security_group_ingress(
            GroupId=self.security_group_id,
            IpPermissions=[{
                "IpProtocol": "tcp",
                "FromPort": 22,
                "ToPort": 22,
                "IpRanges": [{"CidrIp": f"{self._coordinator_ip()}/32"}],
            }],
        )
        ami = self.ssm.get_parameter(
            Name="/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
        )["Parameter"]["Value"]
        expires = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
        user_data = """#!/bin/bash
set -euo pipefail
dnf install -y python3 python3-pip
python3 -m venv /opt/botolago-venv
/opt/botolago-venv/bin/pip install --disable-pip-version-check aiohttp==3.12.15
mkdir -p /opt/botolago
chown -R ec2-user:ec2-user /opt/botolago /opt/botolago-venv
touch /opt/botolago/ready
shutdown -h +105
"""
        result = self.ec2.run_instances(
            ImageId=ami,
            InstanceType="t3.small",
            MinCount=RUNNER_COUNT,
            MaxCount=RUNNER_COUNT,
            KeyName=self.key_pair_name,
            SubnetId=subnet_id,
            SecurityGroupIds=[self.security_group_id],
            UserData=user_data,
            InstanceInitiatedShutdownBehavior="terminate",
            BlockDeviceMappings=[{
                "DeviceName": "/dev/xvda",
                "Ebs": {
                    "VolumeSize": 8,
                    "VolumeType": "gp3",
                    "DeleteOnTermination": True,
                    "Encrypted": True,
                },
            }],
            TagSpecifications=[{
                "ResourceType": "instance",
                "Tags": [
                    {"Key": "Name", "Value": "botolago-phase6-load-runner"},
                    {"Key": "Purpose", "Value": "botolago-phase6"},
                    {"Key": "Environment", "Value": "staging-v2"},
                    {"Key": "ExpiresAt", "Value": expires},
                ],
            }],
        )
        self.instance_ids = [instance["InstanceId"] for instance in result["Instances"]]
        self._write_state()
        self.ec2.get_waiter("instance_running").wait(InstanceIds=self.instance_ids)
        self.ec2.get_waiter("instance_status_ok").wait(
            InstanceIds=self.instance_ids,
            WaiterConfig={"Delay": 10, "MaxAttempts": 30},
        )
        described = self.ec2.describe_instances(InstanceIds=self.instance_ids)
        instances = [item for reservation in described["Reservations"] for item in reservation["Instances"]]
        instances.sort(key=lambda item: item["InstanceId"])
        self.instance_ips = [item.get("PublicIpAddress", "") for item in instances]
        if len(set(self.instance_ips)) != RUNNER_COUNT or not all(self.instance_ips):
            raise RuntimeError("runners do not have five distinct public IPv4 addresses")
        self._write_state()
        for ip in self.instance_ips:
            self._wait_ssh(ip)
        event("Five isolated runners are healthy with five distinct egress IPs")

    def _write_state(self) -> None:
        private_json(
            STATE_FILE,
            {
                "runId": self.run_id,
                "region": self.runtime["AWS_REGION"],
                "instanceIds": self.instance_ids,
                "securityGroupId": self.security_group_id,
                "keyPairName": self.key_pair_name,
                "createdAt": datetime.now(UTC).isoformat(),
            },
        )

    def ssh_base(self, ip: str) -> list[str]:
        if not self.key_path:
            raise RuntimeError("runner key is unavailable")
        return [
            "ssh",
            "-i",
            str(self.key_path),
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            f"UserKnownHostsFile={self.artifact_dir / 'known_hosts'}",
            f"ec2-user@{ip}",
        ]

    def ssh(self, ip: str, command: str, timeout: int = 60) -> str:
        result = subprocess.run(
            [*self.ssh_base(ip), command],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout.strip()

    def scp_to(self, ip: str, local: Path, remote: str) -> None:
        if not self.key_path:
            raise RuntimeError("runner key is unavailable")
        subprocess.run(
            [
                "scp", "-q", "-i", str(self.key_path),
                "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                "-o", "StrictHostKeyChecking=accept-new",
                "-o", f"UserKnownHostsFile={self.artifact_dir / 'known_hosts'}",
                str(local), f"ec2-user@{ip}:{remote}",
            ],
            check=True,
            timeout=120,
        )

    def scp_from(self, ip: str, remote: str, local: Path) -> None:
        if not self.key_path:
            raise RuntimeError("runner key is unavailable")
        subprocess.run(
            [
                "scp", "-q", "-i", str(self.key_path),
                "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                "-o", "StrictHostKeyChecking=accept-new",
                "-o", f"UserKnownHostsFile={self.artifact_dir / 'known_hosts'}",
                f"ec2-user@{ip}:{remote}", str(local),
            ],
            check=True,
            timeout=120,
        )

    def _wait_ssh(self, ip: str) -> None:
        for _ in range(40):
            try:
                if self.ssh(ip, "test -f /opt/botolago/ready && echo ready", 20) == "ready":
                    return
            except (subprocess.SubprocessError, OSError):
                time.sleep(5)
        raise RuntimeError("a runner did not become SSH-ready")

    def deploy_and_provision_sessions(self) -> None:
        event("Distributing credentials and provisioning sessions at 0.4 req/sec per runner")
        runtime_path = self.artifact_dir / "runner-runtime.env"
        private_write(
            runtime_path,
            "BOTOLAGO_LOAD_ENVIRONMENT=staging-v2\n"
            f"BOTOLAGO_STAGING_SUPABASE_URL={self.supabase_url}\n"
            "BOTOLAGO_STAGING_PUBLISHABLE_KEY="
            f"{self.runtime['SUPABASE_STAGING_PUBLISHABLE_KEY']}\n",
        )
        load_script = PROJECT_ROOT / "scripts/backend/fantasy-load-test.py"
        session_script = PROJECT_ROOT / "scripts/backend/fantasy-session-provisioner.py"

        def deploy(index: int) -> None:
            ip = self.instance_ips[index]
            records = [
                {
                    "number": item["number"],
                    "email": item["email"],
                    "password": item["password"],
                    "user_id": item["user_id"],
                }
                for item in self.users[index * USERS_PER_RUNNER : (index + 1) * USERS_PER_RUNNER]
            ]
            credential_path = self.artifact_dir / f"credentials-{index}.json"
            private_json(credential_path, records)
            try:
                self.scp_to(ip, load_script, "/opt/botolago/fantasy-load-test.py")
                self.scp_to(ip, session_script, "/opt/botolago/fantasy-session-provisioner.py")
                self.scp_to(ip, runtime_path, "/opt/botolago/runtime.env")
                self.scp_to(ip, credential_path, f"/opt/botolago/credentials-{index}.json")
                self.ssh(
                    ip,
                    "chmod 600 /opt/botolago/runtime.env "
                    f"/opt/botolago/credentials-{index}.json && "
                    "chmod 700 /opt/botolago/*.py",
                )
            finally:
                credential_path.unlink(missing_ok=True)

        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            list(executor.map(deploy, range(RUNNER_COUNT)))
        runtime_path.unlink(missing_ok=True)

        command = (
            "set -a; . /opt/botolago/runtime.env; set +a; "
            "BOTOLAGO_SESSION_OPERATION=provision "
            "BOTOLAGO_AUTH_RATE_PER_SECOND=0.4 "
            "BOTOLAGO_LOAD_CREDENTIAL_CACHE=/opt/botolago/credentials-{index}.json "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            "/opt/botolago-venv/bin/python /opt/botolago/fantasy-session-provisioner.py"
        )

        def provision(index: int) -> dict[str, Any]:
            output = self.ssh(self.instance_ips[index], command.format(index=index), 1800)
            return json.loads(output)

        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            summaries = list(executor.map(provision, range(RUNNER_COUNT)))
        if any(
            item.get("sessions") != USERS_PER_RUNNER
            or item.get("uniqueSubjects") != USERS_PER_RUNNER
            or item.get("uniqueSessionIds") != USERS_PER_RUNNER
            or item.get("minimumValidityMinutes", 0) < 20
            for item in summaries
        ):
            raise RuntimeError("distributed session validation failed")
        if sum(item["sessions"] for item in summaries) != TOTAL_USERS:
            raise RuntimeError("distributed session count is not 2,500")
        for field in (
            "subjectFingerprints",
            "sessionFingerprints",
            "accessTokenFingerprints",
            "refreshTokenFingerprints",
        ):
            values = [
                fingerprint
                for item in summaries
                for fingerprint in item.get(field, [])
            ]
            if len(values) != TOTAL_USERS or len(set(values)) != TOTAL_USERS:
                raise RuntimeError(f"distributed {field} validation failed")
            values.clear()
            for item in summaries:
                item[field] = []
        for item in self.users:
            item["password"] = ""
        self.passwords.clear()
        event("Validated 2,500 unique authenticated sessions with >=20 minutes validity")

    def start_metrics(self) -> None:
        if not self.temp_secret:
            raise RuntimeError("temporary metrics key is unavailable")
        metrics_output = self.artifact_dir / "metrics.ndjson"
        process_env = {
            **os.environ,
            "BOTOLAGO_LOAD_ENVIRONMENT": "staging-v2",
            "BOTOLAGO_STAGING_PROJECT_REF": self.project_ref,
            "BOTOLAGO_STAGING_SUPABASE_URL": self.supabase_url,
            "BOTOLAGO_STAGING_SECRET_KEY": self.temp_secret,
            "BOTOLAGO_METRICS_INTERVAL_SECONDS": "60",
            "BOTOLAGO_METRICS_DURATION_SECONDS": "900",
            "BOTOLAGO_METRICS_OUTPUT": str(metrics_output),
        }
        self.metrics_process = subprocess.Popen(
            [sys.executable, str(PROJECT_ROOT / "scripts/backend/supabase-metrics-collector.py")],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=process_env,
        )
        self.sql_sampler_thread = threading.Thread(
            target=self._sample_database_until_stopped,
            name="phase6-database-sampler",
            daemon=True,
        )
        self.sql_sampler_thread.start()
        event("Started 60-second Metrics API collection for the 15-minute evidence window")

    def _sample_database_until_stopped(self) -> None:
        while not self.sql_sampler_stop.is_set():
            try:
                self.sample_database()
            except Exception:
                pass
            self.sql_sampler_stop.wait(10)

    def run_profile(self, profile: str, duration: int, burst_seconds: int) -> dict[str, Any]:
        if profile not in {"merge_gate", "telemetry_soak"}:
            raise RuntimeError("unsupported load profile")
        # Preparation reads are outside the measured workload. Give all five
        # runners enough time to complete bounded retries before the shared
        # start instant instead of treating a transient setup response as load.
        start_at = time.time() + 75
        command = (
            "set -a; . /opt/botolago/runtime.env; set +a; "
            f"BOTOLAGO_LOAD_PROFILE={profile} "
            "BOTOLAGO_LOAD_USERS=2500 BOTOLAGO_LOAD_SHARD_COUNT=5 "
            "BOTOLAGO_LOAD_FIRST_USER=50001 BOTOLAGO_LOAD_SUSTAINED_RPS=250 "
            "BOTOLAGO_LOAD_BURST_RPS=600 "
            f"BOTOLAGO_LOAD_BURST_SECONDS={burst_seconds} "
            f"BOTOLAGO_LOAD_DURATION_SECONDS={duration} "
            f"BOTOLAGO_LOAD_START_AT={start_at:.3f} "
            "BOTOLAGO_LOAD_INCLUDE_SAMPLES=1 "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            f"BOTOLAGO_LOAD_RESULTS_PATH=/opt/botolago/{profile}.json "
            "BOTOLAGO_LOAD_SHARD_INDEX={index} "
            "/opt/botolago-venv/bin/python /opt/botolago/fantasy-load-test.py "
            f"> /opt/botolago/{profile}.summary.json "
            f"2> /opt/botolago/{profile}.error.log"
        )

        def run(index: int) -> dict[str, Any] | None:
            timeout = duration + 900
            try:
                self.ssh(self.instance_ips[index], command.format(index=index), timeout)
                return None
            except (subprocess.SubprocessError, OSError) as error:
                diagnostic = "runner diagnostic unavailable"
                try:
                    diagnostic = self.ssh(
                        self.instance_ips[index],
                        f"tail -c 4000 /opt/botolago/{profile}.error.log",
                        30,
                    )
                except (subprocess.SubprocessError, OSError):
                    pass
                return {
                    "runner": index,
                    "error": type(error).__name__,
                    "diagnostic": safe_runner_diagnostic(diagnostic),
                }

        event(f"Starting synchronized {profile} on all five runners")
        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            failures = [item for item in executor.map(run, range(RUNNER_COUNT)) if item]
        if failures:
            private_json(self.artifact_dir / f"{profile}-setup-failures.json", failures)
            summaries = "; ".join(
                f"runner={item['runner']} {item['error']}: {item['diagnostic']}"
                for item in failures
            )
            raise RuntimeError(f"{profile} runner setup failed: {summaries}")
        shards = []
        for index, ip in enumerate(self.instance_ips):
            local = self.artifact_dir / f"{profile}-shard-{index}.json"
            self.scp_from(ip, f"/opt/botolago/{profile}.json", local)
            shards.append(json.loads(local.read_text(encoding="utf-8")))
        aggregate = self.aggregate_profile(profile, shards)
        private_json(self.artifact_dir / f"{profile}-aggregate.json", aggregate)
        event(
            f"Completed {profile}: {aggregate['profile']['requests']} measured requests, "
            f"unexpected errors {aggregate['overall']['unexpectedErrors']}"
        )
        return aggregate

    def aggregate_profile(self, profile: str, shards: list[dict[str, Any]]) -> dict[str, Any]:
        if len(shards) != RUNNER_COUNT:
            raise RuntimeError("profile does not contain five runner results")
        samples: dict[str, list[float]] = defaultdict(list)
        operation_counts: Counter[str] = Counter()
        error_codes: Counter[str] = Counter()
        expected = 0
        unexpected = 0
        requests = 0
        for shard in shards:
            if shard.get("profile", {}).get("loadProfile") != profile:
                raise RuntimeError("runner returned the wrong load profile")
            requests += int(shard["profile"]["requests"])
            expected += int(shard["overall"]["expectedRejections"])
            unexpected += int(shard["overall"]["unexpectedErrors"])
            error_codes.update(shard.get("errorCodes", {}))
            for operation, values in (shard.get("latencySamplesMs") or {}).items():
                samples[operation].extend(float(value) for value in values)
            for operation, summary in shard.get("operations", {}).items():
                operation_counts[operation] += int(summary["count"])
        reads = samples["team_read"] + samples["transfer_preview"]
        mutations = samples["lineup"] + samples["transfer_confirm"] + samples["chip"]
        expected_requests = 18_500 if profile == "merge_gate" else 150_000
        if requests != expected_requests:
            raise RuntimeError(f"{profile} scheduled {requests}, expected {expected_requests}")
        traffic = {
            "lineup": operation_counts["lineup"],
            "transfers": operation_counts["transfer_preview"]
            + operation_counts["transfer_confirm"],
            "chips": operation_counts["chip"],
            "reads": operation_counts["team_read"],
        }
        expected_traffic = {
            name: expected_requests * percent // 100
            for name, percent in {"lineup": 60, "transfers": 30, "chips": 5, "reads": 5}.items()
        }
        if traffic != expected_traffic:
            raise RuntimeError(f"{profile} traffic mix does not match the approved profile")
        unexpected_rate = unexpected / max(requests, 1)
        overall = {
            "readP50Ms": percentile(reads, 50),
            "readP95Ms": percentile(reads, 95),
            "readP99Ms": percentile(reads, 99),
            "mutationP50Ms": percentile(mutations, 50),
            "mutationP95Ms": percentile(mutations, 95),
            "mutationP99Ms": percentile(mutations, 99),
            "expectedRejections": expected,
            "unexpectedErrors": unexpected,
            "unexpectedErrorRate": round(unexpected_rate, 6),
        }
        return {
            "profile": {
                "name": profile,
                "users": TOTAL_USERS,
                "runners": RUNNER_COUNT,
                "requests": requests,
                "traffic": traffic,
            },
            "overall": overall,
            "operations": {
                name: {
                    "count": len(values),
                    "p50Ms": percentile(values, 50),
                    "p95Ms": percentile(values, 95),
                    "p99Ms": percentile(values, 99),
                }
                for name, values in sorted(samples.items())
            },
            "errorCodes": dict(error_codes),
            "passCriteria": {
                "readP95": overall["readP95Ms"] <= 500,
                "mutationP95": overall["mutationP95Ms"] <= 1500,
                "mutationP99": overall["mutationP99Ms"] <= 3000,
                "unexpectedErrorRate": unexpected_rate < 0.005,
            },
        }

    def sample_database(self) -> None:
        rows = self.sql(
            "select statement_timestamp() as sampled_at, "
            "(select count(*) from pg_stat_activity where datname = current_database())::integer as connections, "
            "current_setting('max_connections')::integer as max_connections, "
            "(select count(*) from pg_stat_activity where datname = current_database() "
            "and wait_event_type = 'Lock')::integer as lock_waits, "
            "(select deadlocks from pg_stat_database where datname = current_database())::bigint as deadlocks, "
            "(select conflicts from pg_stat_database where datname = current_database())::bigint as conflicts, "
            "(select case when blks_hit + blks_read = 0 then 1 else "
            "blks_hit::numeric / (blks_hit + blks_read) end from pg_stat_database "
            "where datname = current_database()) as cache_hit_ratio"
        )
        if isinstance(rows, list) and rows:
            self.sql_samples.append(rows[0])

    def await_metrics(self) -> dict[str, Any]:
        if not self.metrics_process:
            raise RuntimeError("metrics collector was not started")
        stdout, stderr = self.metrics_process.communicate(timeout=300)
        self.sql_sampler_stop.set()
        if self.sql_sampler_thread:
            self.sql_sampler_thread.join(timeout=15)
        if self.metrics_process.returncode != 0:
            raise RuntimeError(f"metrics collector failed: {stderr.strip()[:120]}")
        summary = json.loads(stdout)
        if summary.get("scrapeErrors") != 0 or summary.get("scrapes", 0) < 15:
            raise RuntimeError("Metrics API collection is incomplete")
        self.metrics_summary = summary
        event(f"Metrics API collection completed with {summary['scrapes']} successful scrapes")
        return summary

    def integrity(self) -> dict[str, Any]:
        user_ids = [item["user_id"] for item in self.users]
        ids = ",".join(f"'{value}'::uuid" for value in user_ids)
        rows = self.sql(
            "with gate_teams as (select id from app.fantasy_teams "
            f"where user_id in ({ids})), checks as (select "
            "(select count(*) from (select transfer_batch_id, sequence_number "
            "from app.fantasy_transfers transfer join app.fantasy_transfer_batches batch "
            "on batch.id = transfer.transfer_batch_id where batch.fantasy_team_id in "
            "(select id from gate_teams) group by transfer_batch_id, sequence_number having count(*) > 1) d)::integer as duplicate_transfers, "
            "(select count(*) from (select fantasy_team_id, gameweek_id "
            "from app.fantasy_chip_uses where fantasy_team_id in (select id from gate_teams) "
            "group by fantasy_team_id, gameweek_id having count(*) > 1) d)::integer as duplicate_chips, "
            "(select count(*) from app.fantasy_teams where id in (select id from gate_teams) "
            "and (bank < 0 or team_value <= 0 or free_transfers < 0))::integer as corrupted_balances, "
            "(select count(*) from app.fantasy_transfer_batches where fantasy_team_id in "
            "(select id from gate_teams) and (bank_before < 0 or bank_after < 0))::integer as corrupt_transfer_balances, "
            "(select count(*) from app_private.fantasy_mutation_audit audit join app.fantasy_gameweeks gw "
            f"on gw.id = '{GAMEWEEK_ID}'::uuid where audit.fantasy_team_id in (select id from gate_teams) "
            "and audit.accepted and audit.occurred_at >= gw.deadline_at)::integer as deadline_bypasses, "
            "(select count(*) from (select team.id from gate_teams team left join "
            "app.fantasy_squad_memberships membership on membership.fantasy_team_id = team.id "
            "and membership.sold_at is null group by team.id having count(membership.id) <> 15) d)::integer as invalid_active_squads) "
            "select * from checks"
        )[0]
        passed = all(int(value) == 0 for value in rows.values())
        result = {**rows, "passed": passed}
        private_json(self.artifact_dir / "integrity.json", result)
        event(f"Integrity validation {'passed' if passed else 'failed'}")
        return result

    def analyze_metrics(self) -> dict[str, Any]:
        path = self.artifact_dir / "metrics.ndjson"
        records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        series_by_name: dict[str, list[float]] = defaultdict(list)
        per_scrape: list[dict[str, float]] = []
        for record in records:
            scrape: dict[str, float] = {}
            for metric in record.get("metrics", []):
                name = metric["series"].split("{")[0]
                series_by_name[name].append(float(metric["value"]))
                scrape[metric["series"]] = float(metric["value"])
            per_scrape.append(scrape)
        names = sorted(series_by_name)
        candidate_names = [
            name for name in names
            if any(term in name.lower() for term in (
                "cpu", "pool", "connection", "backend", "lock", "deadlock",
                "cache", "block", "disk", "io", "duration", "latency", "timeout"
            ))
        ]
        cpu_intervals: list[float] = []
        io_read_bytes = 0.0
        io_write_bytes = 0.0
        if len(per_scrape) > 1:
            for previous, current in zip(per_scrape, per_scrape[1:]):
                idle_series = [
                    series for series in current
                    if series.startswith("node_cpu_seconds_total{")
                    and ('mode="idle"' in series or "mode='idle'" in series)
                    and series in previous
                ]
                if idle_series:
                    elapsed = 60 * len(idle_series)
                    idle_delta = sum(current[item] - previous[item] for item in idle_series)
                    cpu_intervals.append(max(0.0, min(100.0, 100 * (1 - idle_delta / elapsed))))
            for prefix, target in (
                ("node_disk_read_bytes_total", "read"),
                ("node_disk_written_bytes_total", "write"),
            ):
                matching = [
                    series for series in per_scrape[-1]
                    if series.startswith(prefix) and series in per_scrape[0]
                ]
                delta = sum(
                    max(0.0, per_scrape[-1][item] - per_scrape[0][item])
                    for item in matching
                )
                if target == "read":
                    io_read_bytes = delta
                else:
                    io_write_bytes = delta

        pool_utilization: list[float] = []
        for scrape in per_scrape:
            active = sum(
                value for series, value in scrape.items()
                if series.split("{")[0] in {
                    "pgbouncer_pools_server_active_connections",
                    "supavisor_pool_active_connections",
                }
            )
            idle = sum(
                value for series, value in scrape.items()
                if series.split("{")[0] in {
                    "pgbouncer_pools_server_idle_connections",
                    "supavisor_pool_idle_connections",
                }
            )
            if active + idle > 0:
                pool_utilization.append(100 * active / (active + idle))

        result = {
            "scrapes": len(records),
            "seriesNames": candidate_names,
            "databaseSamples": self.sql_samples,
            "maxCpuPercent": round(max(cpu_intervals), 3) if cpu_intervals else None,
            "ioReadBytes": int(io_read_bytes),
            "ioWriteBytes": int(io_write_bytes),
            "maxPoolUtilizationPercent": (
                round(max(pool_utilization), 3) if pool_utilization else None
            ),
            "maxConnections": max((int(item["connections"]) for item in self.sql_samples), default=0),
            "maxConnectionUtilizationPercent": round(
                max(
                    (
                        100 * int(item["connections"]) / max(int(item["max_connections"]), 1)
                        for item in self.sql_samples
                    ),
                    default=0,
                ),
                3,
            ),
            "maxLockWaits": max((int(item["lock_waits"]) for item in self.sql_samples), default=0),
            "deadlockDelta": (
                int(self.sql_samples[-1]["deadlocks"]) - int(self.sql_samples[0]["deadlocks"])
                if len(self.sql_samples) > 1 else 0
            ),
            "conflictDelta": (
                int(self.sql_samples[-1]["conflicts"]) - int(self.sql_samples[0]["conflicts"])
                if len(self.sql_samples) > 1 else 0
            ),
            "minimumCacheHitPercent": round(
                min((float(item["cache_hit_ratio"]) * 100 for item in self.sql_samples), default=0),
                3,
            ),
        }
        private_json(self.artifact_dir / "metrics-analysis.json", result)
        return result

    def revoke_remote_sessions(self) -> None:
        if not self.instance_ips:
            return
        command = (
            "set -a; . /opt/botolago/runtime.env; set +a; "
            "BOTOLAGO_SESSION_OPERATION=revoke "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            "/opt/botolago-venv/bin/python /opt/botolago/fantasy-session-provisioner.py"
        )

        def revoke(ip: str) -> dict[str, Any]:
            try:
                if self.ssh(
                    ip,
                    "test -f /opt/botolago/sessions.json && echo present || echo absent",
                    30,
                ) == "absent":
                    return {"revoked": True, "failures": 0}
                output = self.ssh(ip, command, 600)
                return json.loads(output)
            except (subprocess.SubprocessError, OSError, ValueError):
                return {"revoked": False, "failures": USERS_PER_RUNNER}

        with concurrent.futures.ThreadPoolExecutor(max_workers=RUNNER_COUNT) as executor:
            results = list(executor.map(revoke, self.instance_ips))
        if all(item.get("revoked") is True for item in results):
            event("Revoked all runner-held sessions")
        else:
            event("Remote logout was incomplete; database cleanup remains authoritative")

    def delete_users_and_state(self) -> dict[str, Any]:
        if not self.users:
            return {"users": 0, "sessions": 0, "refresh_tokens": 0}
        ids = ",".join(f"'{item['user_id']}'::uuid" for item in self.users)
        query = f"""
begin;
create temporary table phase6_gate_users(user_id uuid primary key) on commit drop;
insert into phase6_gate_users values {','.join(f"('{item['user_id']}'::uuid)" for item in self.users)};
create temporary table phase6_gate_teams(team_id uuid primary key) on commit drop;
insert into phase6_gate_teams select id from app.fantasy_teams
where user_id in (select user_id from phase6_gate_users);

delete from app_private.fantasy_free_transfer_rollovers where fantasy_team_id in (select team_id from phase6_gate_teams);
delete from app_private.fantasy_mutation_audit where fantasy_team_id in (select team_id from phase6_gate_teams) or user_id in (select user_id from phase6_gate_users);
delete from app_private.fantasy_idempotency_keys where user_id in (select user_id from phase6_gate_users);
delete from app.fantasy_rankings where fantasy_team_id in (select team_id from phase6_gate_teams);
delete from app.fantasy_league_memberships where fantasy_team_id in (select team_id from phase6_gate_teams) or user_id in (select user_id from phase6_gate_users);
delete from app.fantasy_leagues where owner_user_id in (select user_id from phase6_gate_users);
delete from app.fantasy_team_gameweek_results where fantasy_team_id in (select team_id from phase6_gate_teams);
delete from app.fantasy_auto_substitutions where lineup_id in (select id from app.fantasy_lineups where fantasy_team_id in (select team_id from phase6_gate_teams));
delete from app.fantasy_lineup_players where lineup_id in (select id from app.fantasy_lineups where fantasy_team_id in (select team_id from phase6_gate_teams));
delete from app.fantasy_lineups where fantasy_team_id in (select team_id from phase6_gate_teams);
delete from app.fantasy_transfers where transfer_batch_id in (select id from app.fantasy_transfer_batches where fantasy_team_id in (select team_id from phase6_gate_teams));
delete from app.fantasy_transfer_batches where fantasy_team_id in (select team_id from phase6_gate_teams);
delete from app.fantasy_free_hit_snapshot_players where snapshot_id in (select id from app.fantasy_free_hit_snapshots where fantasy_team_id in (select team_id from phase6_gate_teams));
delete from app.fantasy_free_hit_snapshots where fantasy_team_id in (select team_id from phase6_gate_teams);
delete from app.fantasy_chip_uses where fantasy_team_id in (select team_id from phase6_gate_teams);
commit;
"""
        self.sql(query)

        def delete_batches(label: str, target: str, maximum_batches: int) -> None:
            total_deleted = 0
            for _ in range(maximum_batches):
                rows = self.sql(target)
                deleted = int(rows[0]["deleted"]) if isinstance(rows, list) and rows else -1
                if deleted < 0:
                    raise RuntimeError(f"{label} cleanup returned an invalid count")
                total_deleted += deleted
                if deleted == 0:
                    event(f"Batched cleanup removed {total_deleted} temporary {label}")
                    return
            raise RuntimeError(f"{label} cleanup exceeded its bounded batch budget")

        delete_batches(
            "squad memberships",
            "with target as (select membership.id from "
            "app.fantasy_squad_memberships membership join app.fantasy_teams team "
            "on team.id = membership.fantasy_team_id "
            f"where team.user_id in ({ids}) limit 5000), deleted as (delete from "
            "app.fantasy_squad_memberships membership using target where "
            "membership.id = target.id returning 1) select count(*)::integer as "
            "deleted from deleted",
            20,
        )
        delete_batches(
            "Fantasy teams",
            "with target as (select id from app.fantasy_teams "
            f"where user_id in ({ids}) limit 250), deleted as (delete from "
            "app.fantasy_teams team using target where team.id = target.id "
            "returning 1) select count(*)::integer as deleted from deleted",
            20,
        )
        delete_batches(
            "Auth users",
            f"with target as (select id from auth.users where id in ({ids}) "
            "limit 250), deleted as (delete from auth.users users using target "
            "where users.id = target.id returning 1) select count(*)::integer "
            "as deleted from deleted",
            20,
        )
        verification = self.sql(
            "select "
            f"(select count(*) from auth.users where id in ({ids}))::integer as users, "
            f"(select count(*) from auth.sessions where user_id in ({ids}))::integer as sessions, "
            f"(select count(*) from auth.refresh_tokens where user_id::uuid in ({ids}) and revoked is false)::integer as refresh_tokens"
        )[0]
        event(
            f"Deleted all {len(self.users)} tracked temporary test users "
            "and their isolated Fantasy state"
        )
        return verification

    def terminate_runners(self) -> None:
        had_resources = bool(
            self.instance_ids or self.security_group_id or self.key_pair_name or self.key_path
        )
        if self.instance_ids:
            self.ec2.terminate_instances(InstanceIds=self.instance_ids)
            self.ec2.get_waiter("instance_terminated").wait(
                InstanceIds=self.instance_ids,
                WaiterConfig={"Delay": 10, "MaxAttempts": 30},
            )
            event("Terminated all temporary AWS runners")
        if self.security_group_id:
            for attempt in range(12):
                try:
                    self.ec2.delete_security_group(GroupId=self.security_group_id)
                    break
                except self.ec2.exceptions.ClientError:
                    if attempt == 11:
                        raise
                    time.sleep(5)
        if self.key_pair_name:
            self.ec2.delete_key_pair(KeyName=self.key_pair_name)
        if self.key_path:
            self.key_path.unlink(missing_ok=True)
        STATE_FILE.unlink(missing_ok=True)
        self.instance_ids.clear()
        self.instance_ips.clear()
        if had_resources:
            event("Removed the temporary security group and EC2 key pair")

    def cleanup(self) -> dict[str, Any]:
        cleanup: dict[str, Any] = {"errors": []}
        try:
            self.revoke_remote_sessions()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"session_revoke:{type(error).__name__}")
        try:
            cleanup["database"] = self.delete_users_and_state()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"database_cleanup:{type(error).__name__}")
        try:
            self.restore_capacity_gameweek()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"gameweek_restore:{type(error).__name__}")
        try:
            self.delete_temporary_key()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"key_cleanup:{type(error).__name__}")
        try:
            self.terminate_runners()
        except Exception as error:  # cleanup must continue
            cleanup["errors"].append(f"aws_cleanup:{type(error).__name__}")
        self.passwords.clear()
        for item in self.users:
            item["password"] = ""
        try:
            remaining_keys = self.management(
                "GET", f"/v1/projects/{self.project_ref}/api-keys"
            )
            active_runners = self.ec2.describe_instances(
                Filters=[
                    {"Name": "tag:Purpose", "Values": ["botolago-phase6"]},
                    {
                        "Name": "instance-state-name",
                        "Values": ["pending", "running", "stopping", "stopped"],
                    },
                ]
            )
            security_groups = self.ec2.describe_security_groups(
                Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
            )["SecurityGroups"]
            key_pairs = self.ec2.describe_key_pairs(
                Filters=[{"Name": "tag:Purpose", "Values": ["botolago-phase6"]}]
            )["KeyPairs"]
            cleanup["verification"] = {
                "metricsKeys": sum(
                    1 for item in remaining_keys
                    if item.get("name") == TEMP_KEY_NAME
                ),
                "activeRunners": sum(
                    len(item["Instances"])
                    for item in active_runners["Reservations"]
                ),
                "securityGroups": len(security_groups),
                "keyPairs": len(key_pairs),
                "keyMaterialFiles": int(bool(self.key_path and self.key_path.exists())),
            }
        except Exception as error:
            cleanup["errors"].append(f"cleanup_verification:{type(error).__name__}")
        private_json(self.artifact_dir / "cleanup.json", cleanup)
        return cleanup

    def run(self) -> int:
        outcome: dict[str, Any] = {"runId": self.run_id, "passed": False}
        failure: str | None = None
        try:
            self.preflight()
            self.create_temporary_key()
            self.prepare_capacity_gameweek()
            self.provision_runners()
            self.create_users()
            self.seed_user_fantasy_state()
            self.deploy_and_provision_sessions()
            self.start_metrics()
            merge = self.run_profile("merge_gate", 60, 10)
            self.sample_database()
            soak = self.run_profile("telemetry_soak", 600, 0)
            self.sample_database()
            metrics_summary = self.await_metrics()
            self.sample_database()
            integrity = self.integrity()
            metrics = self.analyze_metrics()
            criteria = {
                **{f"merge_{key}": value for key, value in merge["passCriteria"].items()},
                **{f"soak_{key}": value for key, value in soak["passCriteria"].items()},
                "integrity": integrity["passed"],
                "metricsComplete": metrics_summary["scrapeErrors"] == 0,
                "connectionUtilization": metrics["maxConnectionUtilizationPercent"] < 80,
                "cpu": metrics["maxCpuPercent"] is not None
                and metrics["maxCpuPercent"] < 80,
                "poolUtilization": metrics["maxPoolUtilizationPercent"] is not None
                and metrics["maxPoolUtilizationPercent"] < 80,
                "deadlocks": metrics["deadlockDelta"] == 0,
                "conflicts": metrics["conflictDelta"] == 0,
            }
            outcome.update(
                {
                    "mergeGate": merge,
                    "soak": soak,
                    "userCreation": dict(self.user_creation_stats),
                    "metrics": metrics,
                    "integrity": integrity,
                    "criteria": criteria,
                    "passed": all(criteria.values()),
                }
            )
        except Exception as error:
            failure = f"{type(error).__name__}: {error}"
            outcome["failure"] = failure
            event(f"Gate stopped: {failure}")
        finally:
            if self.metrics_process and self.metrics_process.poll() is None:
                self.metrics_process.terminate()
                try:
                    self.metrics_process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self.metrics_process.kill()
            cleanup = self.cleanup()
            outcome["cleanup"] = cleanup
            if self.cloud_mutation_started:
                RUNTIME_FILE.unlink(missing_ok=True)
            outcome["localRuntimeCredentialFileRemaining"] = RUNTIME_FILE.exists()
            cleanup_db = cleanup.get("database", {})
            cleanup_external = cleanup.get("verification", {})
            cleanup_passed = (
                not cleanup.get("errors")
                and cleanup_db.get("users", 0) == 0
                and cleanup_db.get("sessions", 0) == 0
                and cleanup_db.get("refresh_tokens", 0) == 0
                and cleanup_external.get("metricsKeys", 0) == 0
                and cleanup_external.get("activeRunners", 0) == 0
                and cleanup_external.get("securityGroups", 0) == 0
                and cleanup_external.get("keyPairs", 0) == 0
                and cleanup_external.get("keyMaterialFiles", 0) == 0
                and (
                    not self.cloud_mutation_started
                    or not outcome["localRuntimeCredentialFileRemaining"]
                )
            )
            outcome["cleanupPassed"] = cleanup_passed
            outcome["passed"] = bool(outcome.get("passed")) and cleanup_passed
            outcome.setdefault("userCreation", dict(self.user_creation_stats))
            private_json(self.artifact_dir / "gate-summary.json", outcome)
            if self.cloud_mutation_started:
                event("Removed the local runtime credential handoff file")
        event(f"Phase 6 external gate verdict: {'PASS' if outcome['passed'] else 'FAIL'}")
        return 0 if outcome["passed"] else 2


if __name__ == "__main__":
    try:
        gate = CapacityGate()
        raise SystemExit(gate.run())
    except KeyboardInterrupt:
        event("Interrupted; automatic cleanup may require the saved cloud state")
        raise
    except Exception as error:
        detail = str(error)
        if not detail.startswith("runtime credential") and detail not in {
            "staging project reference and URL do not match",
            "a staging publishable key is required",
        }:
            detail = type(error).__name__
        event(f"Capacity gate initialization failed: {detail}")
        raise SystemExit(2) from error
