"""Interpret the actual staging exporter counters without changing load thresholds."""
from __future__ import annotations


def metric_map(record):
    return {m['series']: float(m['value']) for m in record.get('metrics', [])}


def cpu_intervals(records):
    """Busy fraction of advancing CPU counters, including cached scrape detection.

    A repeated cached node-exporter response has zero elapsed CPU time; it
    cannot establish either 0% or 100% CPU. Normalize idle by the observed total
    counter advance instead of assuming the exporter advanced by 60 seconds.
    """
    values, duplicates, invalid = [], 0, 0
    previous = None
    for record in records:
        current = {k: v for k, v in metric_map(record).items()
                   if k.startswith('node_cpu_seconds_total{')}
        if not current:
            invalid += 1
            previous = None
            continue
        if previous is not None:
            if current.keys() != previous.keys() or any(current[k] < previous[k] for k in current):
                invalid += 1
            else:
                total = sum(current[k]-previous[k] for k in current)
                idle = sum(current[k]-previous[k] for k in current if 'mode="idle"' in k)
                if total == 0:
                    duplicates += 1
                elif idle < 0 or idle > total or not any('mode="idle"' in k for k in current):
                    invalid += 1
                else:
                    values.append(100 * (1-idle/total))
        previous = current
    return {'maxCpuPercent': round(max(values), 3) if values else None,
            'cpuIntervals': len(values), 'cachedCpuIntervals': duplicates,
            'invalidCpuIntervals': invalid}


def pool_upper_bound(records):
    """Conservative Data API pool occupancy, including its listener as busy.

    PostgREST's available gauge counts idle established connections, not slots
    that could still be opened. All authenticator connections minus those idle
    connections bounds busy pool connections from above; the listener and any
    other authenticator connection make this bound more conservative. Divide
    by the actual advertised PostgREST maximum. Never infer saturation from an
    empty/unused PgBouncer admin pool.
    """
    values, invalid = [], 0
    for record in records:
        metrics = metric_map(record)
        def named(prefix):
            return [v for k,v in metrics.items() if k.startswith(prefix+'{') or k == prefix]
        maximum = named('pgrst_db_pool_max')
        available = named('pgrst_db_pool_available')
        connections = [v for k,v in metrics.items()
                       if k.startswith('connection_stats_connection_count{') and 'username="authenticator"' in k]
        if not maximum or not available or not connections:
            invalid += 1
            continue
        capacity, idle, total = sum(maximum), sum(available), sum(connections)
        if capacity <= 0 or idle < 0 or total < idle:
            invalid += 1
            continue
        values.append(100 * (total-idle)/capacity)
    return {'maxPoolUtilizationPercent': round(max(values), 3) if values else None,
            'poolSamples': len(values), 'invalidPoolSamples': invalid,
            'poolMeasurement': 'conservative_postgrest_occupancy_upper_bound'}
