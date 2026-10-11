import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verifier import parse_badging

class VerifierTests(unittest.TestCase):
    def test_extracts_identity_and_flags(self):
        text = "package: name='com.flzxing.lucky' versionCode='12' versionName='2.0'\nsdkVersion:'26'\ntargetSdkVersion:'36'\nnative-code: 'arm64-v8a'\n"
        report = parse_badging(text, 'A' * 64, 123, 'b' * 64)
        self.assertEqual(report['versionCode'], 12)
        self.assertEqual(report['abis'], ['arm64-v8a'])
        self.assertFalse(report['debuggable'])
        self.assertTrue(parse_badging(text + 'application-debuggable', 'a' * 64, 123, 'b' * 64)['debuggable'])
    def test_accepts_build_tools_36_min_sdk_label(self):
        text = "package: name='com.flzxing.lucky' versionCode='12' versionName='2.0'\nminSdkVersion:'26'\ntargetSdkVersion:'36'\nnative-code: 'arm64-v8a'\n"
        self.assertEqual(parse_badging(text, 'a' * 64, 123, 'b' * 64)['minSdk'], 26)

    def test_rejects_missing_manifest(self):
        with self.assertRaises(ValueError):
            parse_badging('not an Android manifest', 'a' * 64, 123, 'b' * 64)

if __name__ == '__main__': unittest.main()
