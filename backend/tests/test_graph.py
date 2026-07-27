from app.services.graph import extract_plain_text, get_sender


def test_extract_plain_text_returns_text_content_directly():
    message = {"body": {"contentType": "text", "content": "S$6.00 to CHICKEN RICE"}}
    assert extract_plain_text(message) == "S$6.00 to CHICKEN RICE"


def test_extract_plain_text_strips_html_content():
    message = {"body": {"contentType": "html", "content": "<p>S$6.00 to <b>CHICKEN RICE</b></p>"}}
    assert extract_plain_text(message) == "S$6.00 to CHICKEN RICE"


def test_get_sender_formats_name_and_address():
    message = {"from": {"emailAddress": {"name": "DBS Bank", "address": "alerts@dbs.com.sg"}}}
    assert get_sender(message) == "DBS Bank <alerts@dbs.com.sg>"


def test_get_sender_falls_back_to_address_only():
    message = {"from": {"emailAddress": {"name": "", "address": "alerts@dbs.com.sg"}}}
    assert get_sender(message) == "alerts@dbs.com.sg"
