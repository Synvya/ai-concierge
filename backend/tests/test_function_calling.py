"""Tests for OpenAI function calling integration."""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.schemas import ReservationAction, SellerResult
from app.services.assistant import generate_response


@pytest.mark.asyncio
async def test_generate_response_returns_tuple():
    """Test that generate_response returns (text, function_call_data)."""
    with patch("openai.OpenAI") as mock_openai, patch.dict(
        "os.environ", {"OPENAI_API_KEY": "test-key"}
    ):
        # Mock OpenAI response without function call
        mock_message = MagicMock()
        mock_message.content = "I found Smoothies & Muffins!"
        mock_message.tool_calls = None

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai.return_value = mock_client

        results = [
            SellerResult(
                id="test123",
                name="Smoothies & Muffins",
                npub="npub1test",
                supports_reservations=True,
            )
        ]

        text, function_data = await generate_response("Find smoothies", results, [])

        assert text == "I found Smoothies & Muffins!"
        assert function_data is None


@pytest.mark.asyncio
async def test_generate_response_with_function_call():
    """Test that function calls are properly extracted."""
    with patch("openai.OpenAI") as mock_openai, patch.dict(
        "os.environ", {"OPENAI_API_KEY": "test-key"}
    ):
        # Mock OpenAI response WITH function call
        mock_tool_call = MagicMock()
        mock_tool_call.function.name = "send_reservation_request"
        mock_tool_call.function.arguments = json.dumps(
            {
                "restaurant_id": "test123",
                "restaurant_name": "Smoothies & Muffins",
                "npub": "npub1test",
                "party_size": 2,
                "iso_time": "2025-10-25T15:00:00-07:00",
                "notes": "Window seat please",
            }
        )

        mock_message = MagicMock()
        mock_message.content = "Great! I'll send your reservation request."
        mock_message.tool_calls = [mock_tool_call]

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai.return_value = mock_client

        results = [
            SellerResult(
                id="test123",
                name="Smoothies & Muffins",
                npub="npub1test",
                supports_reservations=True,
            )
        ]

        text, function_data = await generate_response(
            "Book for 2 at 3pm tomorrow", results, []
        )

        assert text == "Great! I'll send your reservation request."
        assert function_data is not None
        assert function_data["action"] == "send_reservation_request"
        assert function_data["restaurant_id"] == "test123"
        assert function_data["party_size"] == 2
        assert function_data["iso_time"] == "2025-10-25T15:00:00-07:00"


@pytest.mark.asyncio
async def test_reservation_action_schema_validation():
    """Test that ReservationAction validates correctly."""
    valid_data = {
        "action": "send_reservation_request",
        "restaurant_id": "test123",
        "restaurant_name": "Test Restaurant",
        "npub": "npub1test",
        "party_size": 4,
        "iso_time": "2025-10-25T19:00:00-07:00",
    }

    action = ReservationAction(**valid_data)
    assert action.party_size == 4
    assert action.notes is None


@pytest.mark.asyncio
async def test_reservation_action_with_notes():
    """Test ReservationAction with optional notes."""
    data = {
        "action": "send_reservation_request",
        "restaurant_id": "test123",
        "restaurant_name": "Test Restaurant",
        "npub": "npub1test",
        "party_size": 2,
        "iso_time": "2025-10-25T19:00:00-07:00",
        "notes": "Gluten-free options please",
    }

    action = ReservationAction(**data)
    assert action.notes == "Gluten-free options please"


@pytest.mark.asyncio
async def test_reservation_action_validates_party_size():
    """Test that party_size validation works."""
    from pydantic import ValidationError
    
    with pytest.raises(ValidationError):
        ReservationAction(
            action="send_reservation_request",
            restaurant_id="test123",
            restaurant_name="Test Restaurant",
            npub="npub1test",
            party_size=0,  # Invalid: less than 1
            iso_time="2025-10-25T19:00:00-07:00",
        )

    with pytest.raises(ValidationError):
        ReservationAction(
            action="send_reservation_request",
            restaurant_id="test123",
            restaurant_name="Test Restaurant",
            npub="npub1test",
            party_size=25,  # Invalid: more than 20
            iso_time="2025-10-25T19:00:00-07:00",
        )
