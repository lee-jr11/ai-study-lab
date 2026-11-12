import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MARKUP = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
TEMPLATE = MARKUP + "\n" + (ROOT / "static" / "app.js").read_text(encoding="utf-8")
STYLES = (ROOT / "static" / "tokens.css").read_text(encoding="utf-8") + "\n" + (ROOT / "static" / "app.css").read_text(encoding="utf-8")


class ReadingDeskGuardrailTests(unittest.TestCase):
    def test_decorative_gradient_and_glow_language_is_absent(self):
        source = f"{TEMPLATE}\n{STYLES}".lower()
        banned = (
            "linear-gradient",
            "radial-gradient",
            "conic-gradient",
            "box-shadow",
            "text-shadow",
            "drop-shadow",
            "backdrop-filter",
            "glow",
            "laser",
            "confetti",
        )
        for token in banned:
            with self.subTest(token=token):
                self.assertNotIn(token, source)

    def test_thick_colored_accent_bars_are_absent(self):
        self.assertNotRegex(
            STYLES.lower(),
            r"border-(?:left|right)\s*:\s*[2-9]\d*(?:px|rem)",
        )

    def test_browser_dependencies_are_patched_and_integrity_pinned(self):
        for version in (
            "firebasejs/10.14.1/",
            "dompurify@3.4.17/",
            "jspdf/4.2.1/",
            "@phosphor-icons/web@2.1.2/",
        ):
            with self.subTest(version=version):
                self.assertIn(version, TEMPLATE)
        self.assertGreaterEqual(TEMPLATE.count('integrity="sha384-'), 5)
        self.assertEqual(
            len(re.findall(r'<(?:script|link)[^>]+integrity="sha384-', TEMPLATE)),
            6,
        )

    def test_landing_precedes_a_focused_sign_in_screen(self):
        self.assertIn('id="landing-container"', TEMPLATE)
        self.assertRegex(
            TEMPLATE,
            r'id="auth-container"[^>]+style="display:none;"',
        )
        self.assertNotIn('class="auth-story"', TEMPLATE)
        self.assertIn('function showSignInScreen()', TEMPLATE)
        self.assertIn('function showLandingScreen()', TEMPLATE)

    def test_mobile_landing_copy_and_actions_are_centered(self):
        landing_css = STYLES.split(".landing-shell", 1)[1].split(".auth-shell", 1)[0]
        self.assertRegex(landing_css, r"\.landing-hero\s*\{[^}]*text-align:\s*center;")
        self.assertRegex(
            landing_css,
            r"\.landing-actions\s*\{[^}]*justify-content:\s*center;",
        )
        self.assertRegex(
            STYLES,
            r"\.landing-actions \.primary-button,\s*\.landing-link\s*\{[^}]*justify-content:\s*center;",
        )

    def test_sign_in_back_control_is_a_visible_top_aligned_button(self):
        self.assertIn('type="button" class="text-button auth-back"', TEMPLATE)
        self.assertRegex(
            STYLES,
            r"\.text-button\.auth-back\s*\{[^}]*align-self:\s*flex-start;",
        )
        self.assertRegex(
            STYLES,
            r"\.text-button\.auth-back\s*\{[^}]*min-height:\s*var\(--control-size\);",
        )

    def test_account_identity_is_not_repeated_in_the_workspace_heading(self):
        self.assertRegex(
            TEMPLATE,
            r'<p id="welcome-text" class="sr-only" aria-live="polite"></p>',
        )
        self.assertIn('class="profile-trigger"', TEMPLATE)
        self.assertIn('aria-controls="profileDropdown"', TEMPLATE)

    def test_tool_back_control_is_explicit_and_top_aligned(self):
        self.assertIn('type="button" class="text-button tool-back"', TEMPLATE)
        self.assertEqual(1, TEMPLATE.count('Back to methods'))
        self.assertIn('window.scrollTo(0, 0);', TEMPLATE)
        self.assertRegex(
            STYLES,
            r"\.tool-surface\s*\{[^}]*padding:\s*var\(--space-4\) 0 80px;",
        )
        self.assertRegex(
            STYLES,
            r"\.tool-back\s*\{[^}]*text-decoration:\s*none;",
        )

    def test_css_has_no_remaining_browser_default_effects(self):
        self.assertNotRegex(STYLES, r"\bfilter\s*:\s*(?!none)")
        self.assertIsNone(re.search(r"\bopacity\s*:\s*0\.[0-2]\d*", STYLES))

    def test_dashboard_uses_a_five_color_token_set(self):
        dashboard_tokens = set(re.findall(r"(--dash-[a-z-]+):", STYLES))
        self.assertEqual(
            dashboard_tokens,
            {
                "--dash-canvas",
                "--dash-surface",
                "--dash-ink",
                "--dash-muted",
                "--dash-accent",
            },
        )
        dashboard_rules = STYLES.split(".dash-grid", 1)[1].split(".tool-surface", 1)[0]
        for hex_color in re.findall(r"#[0-9a-fA-F]{3,8}", dashboard_rules):
            self.fail(f"Dashboard rule uses literal color {hex_color}")

    def test_mobile_table_fallback_exists(self):
        self.assertIn("@media (max-width: 767px)", STYLES)
        self.assertIn(".responsive-table td::before", STYLES)

    def test_feedback_uses_in_product_dialog_and_notice(self):
        self.assertNotRegex(TEMPLATE, r"\balert\s*\(")
        self.assertIn('id="confirm-dialog"', TEMPLATE)
        self.assertIn('id="app-notice"', TEMPLATE)
        self.assertIn("function confirmAction(", TEMPLATE)
        self.assertIn("function showNotice(", TEMPLATE)

    def test_small_text_meets_wcag_aa_contrast(self):
        light, dark = STYLES.split('html[data-theme="dark"]', 1)
        dark = dark.split("}", 1)[0]

        def token(block, name):
            match = re.search(
                rf"--{re.escape(name)}:\s*(#[0-9a-fA-F]{{6}}|var\(--[a-z-]+\))",
                block,
            )
            if match is None and block != light:
                match = re.search(rf"--{re.escape(name)}:\s*(#[0-9a-fA-F]{{6}}|var\(--[a-z-]+\))", light)
            self.assertIsNotNone(match, f"Missing color token: {name}")
            value = match.group(1)
            return token(block, value[6:-1]) if value.startswith('var(') else value

        def luminance(hex_color):
            channels = [
                int(hex_color[index : index + 2], 16) / 255
                for index in (1, 3, 5)
            ]
            linear = [
                value / 12.92
                if value <= 0.04045
                else ((value + 0.055) / 1.055) ** 2.4
                for value in channels
            ]
            return (
                0.2126 * linear[0]
                + 0.7152 * linear[1]
                + 0.0722 * linear[2]
            )

        def contrast(foreground, background):
            first, second = sorted(
                (luminance(foreground), luminance(background))
            )
            return (second + 0.05) / (first + 0.05)

        text_tokens = (
            "ink",
            "ink-soft",
            "ink-faint",
            "link",
            "link-hover",
            "danger",
            "success",
            "oxblood",
        )
        surfaces = (
            "paper",
            "surface",
            "surface-strong",
            "paper-deep",
            "forest-soft",
            "danger-soft",
            "success-soft",
            "highlight-soft",
        )
        for theme, block in (("light", light), ("dark", dark)):
            for background_name in surfaces:
                for name in text_tokens:
                    with self.subTest(
                        theme=theme,
                        token=name,
                        background=background_name,
                    ):
                        self.assertGreaterEqual(
                            contrast(
                                token(block, name),
                                token(block, background_name),
                            ),
                            4.5,
                        )
            with self.subTest(theme=theme, token="focus"):
                self.assertGreaterEqual(
                    contrast(token(block, "focus"), token(block, "paper")),
                    3.0,
                )
            for name in ('forest', 'forest-strong'):
                with self.subTest(theme=theme, action=name):
                    self.assertGreaterEqual(
                        contrast(token(light, 'on-action'), token(block, name)), 4.5,
                    )
            with self.subTest(theme=theme, state='dashboard icon accents'):
                self.assertGreaterEqual(contrast(token(block, 'dash-accent'), token(block, 'dash-surface')), 3.0)
            with self.subTest(theme=theme, state='selected text'):
                selection = re.search(r'::selection\s*\{[^}]*color:\s*var\(--([a-z-]+)\);', STYLES)
                self.assertIsNotNone(selection)
                self.assertGreaterEqual(contrast(token(block, selection.group(1)), token(block, 'highlight')), 4.5)

    def test_type_and_spacing_use_the_shared_scales(self):
        app_css = (ROOT / "static" / "app.css").read_text(encoding="utf-8")
        for value in re.findall(r"font-size:\s*([^;]+);", app_css):
            if value == "clamp(2.75rem, 12vw, 4.2rem)":
                continue  # mobile override of --text-display
            with self.subTest(font_size=value):
                self.assertTrue(value.startswith("var(--text-"), value)
        spacing = re.findall(
            r"(?:padding|margin|gap)[a-z-]*:\s*([^;]+);", app_css
        )
        for value in spacing:
            for pixels in re.findall(r"(?<![\w.-])(\d+)px", value):
                with self.subTest(spacing=value):
                    self.assertFalse(3 <= int(pixels) <= 27, value)

    def test_every_design_token_is_consumed(self):
        tokens = (ROOT / "static" / "tokens.css").read_text(encoding="utf-8")
        consumers = STYLES + TEMPLATE
        for name in sorted(set(re.findall(r"^\s*(--[a-z0-9-]+):", tokens, re.M))):
            with self.subTest(token=name):
                self.assertRegex(consumers, rf"var\({re.escape(name)}[,)]")


if __name__ == "__main__":
    unittest.main()
