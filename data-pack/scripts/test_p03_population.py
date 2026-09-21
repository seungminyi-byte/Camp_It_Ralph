"""The source total may be zero; an omitted or protected value is not zero."""
import unittest
from p03_population import read_total


class PopulationTotalsTest(unittest.TestCase):
    def row(self, value, **changes):
        return {'기준연도': '2024', '격자코드': '가사5584', '통계항목': 'to_in_001', '통계값': value, **changes}

    def test_explicit_zero_and_positive(self):
        self.assertEqual(read_total(self.row('0')), ('가사5584', 0))
        self.assertEqual(read_total(self.row(' 23 ')), ('가사5584', 23))

    def test_missing_protected_and_invalid_are_never_zero(self):
        for value in ['', ' ', 'N/A', '*', '-1', 'NaN', 'Infinity']:
            self.assertEqual(read_total(self.row(value)), ('가사5584', None))

    def test_age_buckets_cannot_substitute_for_a_missing_total(self):
        self.assertIsNone(read_total(self.row('0', 통계항목='in_age_001')))

    def test_source_year_and_grid_identity_are_required(self):
        with self.assertRaises(ValueError):
            read_total(self.row('0', 기준연도='2025'))
        with self.assertRaises(ValueError):
            read_total(self.row('0', 격자코드=''))


if __name__ == '__main__':
    unittest.main()
