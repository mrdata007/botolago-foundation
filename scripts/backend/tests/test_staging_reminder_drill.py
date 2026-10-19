import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

PATH=Path(__file__).resolve().parents[1]/'staging-reminder-drill.py'
SPEC=importlib.util.spec_from_file_location('reminder_drill_tests',PATH)
D=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)


class ReminderSafetyTests(unittest.TestCase):
    def test_production_refused_before_network(self):
        with patch.dict(os.environ,{'SUPABASE_STAGING_PROJECT_REF':'tkewgajrljbwgwedqsxn'}), patch.object(D.R.UPDATE,'ManagementTarget') as target:
            with self.assertRaisesRegex(RuntimeError,'refused_target'):
                D.main()
            target.assert_not_called()

    def test_email_links_cannot_use_production_plaintext_or_non_lan_origins(self):
        for url in ['https://botolago.com','http://192.168.1.2:8443','https://127.0.0.1:8443','https://192.168.1.2:8443/evil','https://user:pass@192.168.1.2:8443','https://198.18.0.1:8443','https://192.168.1.2:8443?token=x']:
            with self.subTest(url=url),self.assertRaises(RuntimeError):
                D.validate_origin(url)
        self.assertEqual(D.validate_origin('https://192.168.1.2:8443/'),'https://192.168.1.2:8443')

    def test_owners_are_distinct_uuids_never_sql_fragments(self):
        good=['f9710000-0000-4000-8000-000000000001','f9710000-0000-4000-8000-000000000002']
        self.assertEqual(D.owner_ids(json.dumps(good)),good)
        for bad in [good[:1],[good[0],good[0]],['sql-fragment',good[0]]]:
            with self.subTest(value=bad),self.assertRaises((RuntimeError,ValueError)):
                D.owner_ids(json.dumps(bad))


if __name__=='__main__':
    unittest.main()
