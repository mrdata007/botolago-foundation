import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('free_metrics', Path(__file__).resolve().parents[1]/'fantasy_free_metrics.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def record(idle, busy, connections=5, available=4, maximum=20):
    return {'metrics': [
        {'series':'node_cpu_seconds_total{cpu="0",mode="idle"}', 'value':idle},
        {'series':'node_cpu_seconds_total{cpu="0",mode="user"}', 'value':busy},
        {'series':'pgrst_db_pool_max{}', 'value':maximum},
        {'series':'pgrst_db_pool_available{}', 'value':available},
        {'series':'connection_stats_connection_count{username="authenticator"}', 'value':connections},
        {'series':'pgbouncer_pools_server_active_connections{}', 'value':0},
        {'series':'pgbouncer_pools_server_idle_connections{}', 'value':0}]}


class ExporterInterpretationTests(unittest.TestCase):
    def test_cached_cpu_counters_do_not_fabricate_saturation(self):
        measured=M.cpu_intervals([record(100,10),record(100,10),record(280,30)])
        self.assertEqual(measured['maxCpuPercent'],10)
        self.assertEqual(measured['cachedCpuIntervals'],1)
        self.assertEqual(measured['invalidCpuIntervals'],0)

    def test_cpu_fraction_uses_actual_counter_advance(self):
        self.assertEqual(M.cpu_intervals([record(100,10),record(110,40)])['maxCpuPercent'],75)

    def test_reset_and_wholly_cached_data_cannot_certify_cpu(self):
        reset=M.cpu_intervals([record(100,10),record(1,0)])
        self.assertEqual(reset['invalidCpuIntervals'],1)
        self.assertIsNone(reset['maxCpuPercent'])
        self.assertIsNone(M.cpu_intervals([record(100,10)]*3)['maxCpuPercent'])

    def test_pool_lazy_connections_and_listener_are_conservative(self):
        measured=M.pool_upper_bound([record(100,10)])
        self.assertEqual(measured['maxPoolUtilizationPercent'],5)
        self.assertEqual(measured['invalidPoolSamples'],0)

    def test_real_pool_pressure_still_fails_the_same_eighty_percent_limit(self):
        measured=M.pool_upper_bound([record(100,10,21,2)])
        self.assertGreaterEqual(measured['maxPoolUtilizationPercent'],80)

    def test_inconsistent_or_missing_pool_data_is_not_zero_utilization(self):
        measured=M.pool_upper_bound([record(100,10,3,4),{'metrics':[]}])
        self.assertEqual(measured['invalidPoolSamples'],2)
        self.assertIsNone(measured['maxPoolUtilizationPercent'])


if __name__=='__main__':
    unittest.main()
