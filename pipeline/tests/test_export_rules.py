from medicheck_pipeline.export_rules import OUT, render


def test_web_copy_of_rules_is_up_to_date() -> None:
    # If this fails, synonyms.yaml changed: run `uv run python -m medicheck_pipeline.export_rules`.
    assert OUT.read_text() == render()
