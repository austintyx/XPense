import base64

from app.services.gmail import extract_plain_text, get_sender, strip_html


def test_strip_html_removes_tags_and_collapses_whitespace():
    html = "<div>Hello   <b>World</b>\n\n<p>!</p></div>"
    assert strip_html(html) == "Hello World !"


def test_extract_plain_text_prefers_text_plain_part():
    body = base64.urlsafe_b64encode(b"S$6.00 to CHICKEN RICE").decode()
    message = {
        "payload": {
            "mimeType": "multipart/alternative",
            "parts": [
                {"mimeType": "text/plain", "body": {"data": body}},
                {"mimeType": "text/html", "body": {"data": "ignored"}},
            ],
        }
    }
    assert extract_plain_text(message) == "S$6.00 to CHICKEN RICE"


def test_extract_plain_text_falls_back_to_html():
    body = base64.urlsafe_b64encode(b"<p>S$6.00 to <b>CHICKEN RICE</b></p>").decode()
    message = {
        "payload": {
            "mimeType": "multipart/alternative",
            "parts": [
                {"mimeType": "text/html", "body": {"data": body}},
            ],
        }
    }
    assert extract_plain_text(message) == "S$6.00 to CHICKEN RICE"


def test_get_sender_reads_from_header():
    message = {
        "payload": {
            "headers": [
                {"name": "Subject", "value": "Alert"},
                {"name": "From", "value": "DBS Bank <alerts@dbs.com.sg>"},
            ]
        }
    }
    assert get_sender(message) == "DBS Bank <alerts@dbs.com.sg>"
