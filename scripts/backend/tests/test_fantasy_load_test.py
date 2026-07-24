from __future__ import annotations

import asyncio
import importlib.util
import sys
import unittest
from collections import deque
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "fantasy-load-test.py"
SPEC = importlib.util.spec_from_file_location("fantasy_load_test", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(
        self,
        status: int,
        body: bytes,
        content_type: str = "application/json",
    ) -> None:
        self.status = status
        self.body = body
        self.headers = {"Content-Type": content_type}
        self.charset = "utf-8"

    async def __aenter__(self) -> "FakeResponse":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def read(self) -> bytes:
        return self.body


class FakeSession:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response

    def request(self, *args: object, **kwargs: object) -> FakeResponse:
        return self.response


class PreparationHardeningTests(unittest.TestCase):
    def test_preparation_concurrency_is_bounded(self) -> None:
        self.assertEqual(MODULE.PREPARATION_CONCURRENCY, 10)

    def test_retry_delay_uses_full_jitter_bounds(self) -> None:
        for attempt, maximum in ((0, 0.5), (1, 1.0), (2, 2.0)):
            with self.subTest(attempt=attempt), mock.patch.object(
                MODULE.random, "uniform", return_value=maximum
            ) as uniform:
                self.assertEqual(MODULE.preparation_retry_delay(attempt), maximum)
                uniform.assert_called_once_with(0.0, maximum)

    def test_retry_delay_rejects_negative_attempt(self) -> None:
        with self.assertRaises(ValueError):
            MODULE.preparation_retry_delay(-1)

    def runner(self) -> object:
        runner = MODULE.FantasyLoadRunner.__new__(MODULE.FantasyLoadRunner)
        runner.base_url = "https://staging.example.invalid"
        runner.api_key = "sb_publishable_test"
        runner.observations = []
        runner.response_diagnostics = []
        runner.client_telemetry = []
        runner.client_telemetry_errors = []
        runner.in_flight_requests = 0
        runner.load_machine_cpu_sampler = None
        return runner

    def assert_non_json(
        self,
        *,
        status: int,
        body: bytes,
        content_type: str,
        expected_snippet: str,
    ) -> None:
        runner = self.runner()
        session = FakeSession(FakeResponse(status, body, content_type))
        with self.assertRaises(MODULE.LoadRequestError) as caught:
            asyncio.run(
                runner.request(
                    session,
                    "POST",
                    "/rest/v1/rpc/get_my_fantasy_team",
                    "test-token",
                    {},
                    operation="team_read",
                )
            )
        self.assertEqual(caught.exception.status, status)
        self.assertEqual(caught.exception.code, "non_json_response")
        diagnostic = caught.exception.diagnostic
        self.assertIsNotNone(diagnostic)
        self.assertEqual(diagnostic.status, status)
        self.assertEqual(diagnostic.content_type, content_type)
        self.assertEqual(diagnostic.body_length, len(body))
        self.assertEqual(diagnostic.sanitized_snippet, expected_snippet)
        self.assertEqual(len(runner.observations), 1)
        self.assertEqual(runner.observations[0].error_code, "non_json_response")
        runner.load_profile = "merge_gate"
        runner.total_users = 1
        runner.shard_count = 1
        runner.shard_index = 0
        runner.users = 1
        runner.first_user = 1
        runner.user_start = 1
        runner.global_sustained_rps = 1
        runner.global_burst_rps = 1
        runner.sustained_rps = 1
        runner.burst_rps = 1
        runner.burst_seconds = 10
        runner.total_seconds = 60
        summary = runner.summarize(1.0)
        self.assertEqual(summary["overall"]["unexpectedErrors"], 1)
        self.assertEqual(
            summary["operations"]["team_read"]["unexpectedErrors"],
            1,
        )
        self.assertEqual(summary["nonJsonResponses"]["count"], 1)

    def test_empty_body_is_typed_and_retained(self) -> None:
        self.assert_non_json(
            status=544,
            body=b"",
            content_type="text/plain",
            expected_snippet="[EMPTY]",
        )

    def test_html_error_is_sanitized(self) -> None:
        body = (
            b"<html>Bearer secret-token "
            b"sb_secret_NOT_REAL user@example.invalid "
            b"password=hunter2</html>"
        )
        runner = self.runner()
        session = FakeSession(FakeResponse(503, body, "text/html"))
        with self.assertRaises(MODULE.LoadRequestError) as caught:
            asyncio.run(
                runner.request(
                    session,
                    "POST",
                    "/rest/v1/rpc/get_my_fantasy_team",
                    "test-token",
                    {},
                    operation="setup",
                    record=False,
                )
            )
        diagnostic = caught.exception.diagnostic
        self.assertIsNotNone(diagnostic)
        self.assertEqual(caught.exception.status, 503)
        self.assertEqual(caught.exception.code, "non_json_response")
        self.assertIn("[REDACTED]", diagnostic.sanitized_snippet)
        self.assertNotIn("secret-token", diagnostic.sanitized_snippet)
        self.assertNotIn("sb_secret_NOT_REAL", diagnostic.sanitized_snippet)
        self.assertNotIn("user@example.invalid", diagnostic.sanitized_snippet)
        self.assertNotIn("hunter2", diagnostic.sanitized_snippet)
        self.assertEqual(runner.observations, [])
        self.assertEqual(len(runner.response_diagnostics), 1)

    def test_truncated_json_is_typed_and_retained(self) -> None:
        self.assert_non_json(
            status=200,
            body=b'{"id":"truncated"',
            content_type="application/json",
            expected_snippet='{"id":"truncated"',
        )

    def test_genuine_json_success_path_is_unchanged(self) -> None:
        runner = self.runner()
        response = {"id": "team-id", "version": 3, "lineup": []}
        session = FakeSession(
            FakeResponse(200, MODULE.json.dumps(response).encode(), "application/json")
        )
        actual = asyncio.run(
            runner.request(
                session,
                "POST",
                "/rest/v1/rpc/get_my_fantasy_team",
                "test-token",
                {},
                operation="team_read",
            )
        )
        self.assertEqual(actual, response)
        self.assertEqual(runner.response_diagnostics, [])
        self.assertEqual(runner.observations[0].status, 200)

    def test_prepare_users_retries_non_json_responses(self) -> None:
        runner = self.runner()
        runner.session_tokens = {1: "token"}
        runner.user_start = 1
        runner.users = 1
        runner.states = []
        selection = [
            {
                "fantasyPlayerId": "player-id",
                "slot": "starter",
                "slotOrder": 1,
                "captain": True,
                "viceCaptain": False,
            }
        ]
        runner.rpc = mock.AsyncMock(
            side_effect=[
                MODULE.LoadRequestError(502, "non_json_response"),
                MODULE.LoadRequestError(503, "non_json_response"),
                {
                    "id": "team-id",
                    "version": 4,
                    "lineup": selection,
                },
            ]
        )
        with mock.patch.object(
            MODULE,
            "preparation_retry_delay",
            return_value=0,
        ):
            asyncio.run(runner.prepare_users(object()))
        self.assertEqual(runner.rpc.await_count, 3)
        self.assertEqual(len(runner.states), 1)
        self.assertEqual(runner.states[0].team_id, "team-id")
        self.assertEqual(runner.states[0].version, 4)


class ClientTransportTests(unittest.TestCase):
    def test_connector_configuration_is_explicit(self) -> None:
        verified_context = object()
        connector = object()
        with (
            mock.patch.object(
                MODULE,
                "create_verified_ssl_context",
                return_value=verified_context,
            ),
            mock.patch.object(
                MODULE.aiohttp,
                "TCPConnector",
                return_value=connector,
            ) as constructor,
        ):
            self.assertIs(MODULE.build_load_connector(), connector)
        constructor.assert_called_once_with(
            limit=2000,
            limit_per_host=2000,
            force_close=False,
            keepalive_timeout=15.0,
            use_dns_cache=True,
            ttl_dns_cache=300,
            ssl=verified_context,
        )

    def test_connector_queue_depth_counts_all_host_waiters(self) -> None:
        connector = mock.Mock()
        connector._waiters = {
            "one": deque((object(), object())),
            "two": deque((object(),)),
        }
        self.assertEqual(MODULE.connector_queue_depth(connector), 3)

    def test_machine_cpu_percent_uses_tick_delta(self) -> None:
        with mock.patch.object(
            MODULE,
            "read_host_cpu_ticks",
            side_effect=((100, 50), (200, 75)),
        ):
            sampler = MODULE.LoadMachineCpuSampler()
            self.assertEqual(sampler.percent(), 75.0)

    def test_client_telemetry_records_pressure_every_interval(self) -> None:
        runner = PreparationHardeningTests().runner()
        runner.total_seconds = 60
        runner.in_flight_requests = 17
        runner.load_machine_cpu_sampler = mock.Mock()
        runner.load_machine_cpu_sampler.percent.return_value = 42.0
        connector = mock.Mock()
        connector._waiters = {"host": deque((object(), object(), object()))}

        async def exercise() -> None:
            stop = asyncio.Event()
            with mock.patch.object(
                MODULE,
                "CLIENT_TELEMETRY_INTERVAL_SECONDS",
                0.001,
            ):
                task = asyncio.create_task(
                    runner.collect_client_telemetry(
                        connector,
                        MODULE.time.perf_counter(),
                        stop,
                    )
                )
                await asyncio.sleep(0.0015)
                runner.in_flight_requests = 9
                connector._waiters = {}
                stop.set()
                await task

        asyncio.run(exercise())
        summary = runner.summarize_client_telemetry()
        self.assertGreaterEqual(summary["sampleCount"], 2)
        self.assertEqual(summary["peakInFlightRequests"], 17)
        self.assertEqual(summary["peakConnectorQueueDepth"], 3)
        self.assertEqual(summary["peakLoadMachineCpuPercent"], 42.0)
        self.assertEqual(summary["samplingErrors"], {})


if __name__ == "__main__":
    unittest.main()
