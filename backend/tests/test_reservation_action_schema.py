"""Tests for ReservationAction schema with contact fields."""

import pytest
from pydantic import ValidationError

from app.schemas import ReservationAction


def test_reservation_action_with_contact_fields():
    """Test ReservationAction with contact_name and contact_phone."""
    data = {
        "action": "send_reservation_request",
        "restaurant_id": "123",
        "restaurant_name": "Test Restaurant",
        "npub": "npub1test123",
        "party_size": 4,
        "iso_time": "2025-10-30T19:00:00-07:00",
        "notes": "Window seat please",
        "contact_name": "John Doe",
        "contact_phone": "+1-555-1234",
    }
    
    action = ReservationAction(**data)
    
    assert action.action == "send_reservation_request"
    assert action.restaurant_id == "123"
    assert action.restaurant_name == "Test Restaurant"
    assert action.npub == "npub1test123"
    assert action.party_size == 4
    assert action.iso_time == "2025-10-30T19:00:00-07:00"
    assert action.notes == "Window seat please"
    assert action.contact_name == "John Doe"
    assert action.contact_phone == "+1-555-1234"


def test_reservation_action_without_contact_fields():
    """Test ReservationAction without optional contact fields (backward compatibility)."""
    data = {
        "action": "send_reservation_request",
        "restaurant_id": "123",
        "restaurant_name": "Test Restaurant",
        "npub": "npub1test123",
        "party_size": 2,
        "iso_time": "2025-10-30T19:00:00-07:00",
    }
    
    action = ReservationAction(**data)
    
    assert action.contact_name is None
    assert action.contact_phone is None


def test_reservation_action_with_only_name():
    """Test ReservationAction with only contact_name."""
    data = {
        "action": "send_reservation_request",
        "restaurant_id": "123",
        "restaurant_name": "Test Restaurant",
        "npub": "npub1test123",
        "party_size": 2,
        "iso_time": "2025-10-30T19:00:00-07:00",
        "contact_name": "Jane Smith",
    }
    
    action = ReservationAction(**data)
    
    assert action.contact_name == "Jane Smith"
    assert action.contact_phone is None


def test_reservation_action_with_only_phone():
    """Test ReservationAction with only contact_phone."""
    data = {
        "action": "send_reservation_request",
        "restaurant_id": "123",
        "restaurant_name": "Test Restaurant",
        "npub": "npub1test123",
        "party_size": 2,
        "iso_time": "2025-10-30T19:00:00-07:00",
        "contact_phone": "+1-555-9876",
    }
    
    action = ReservationAction(**data)
    
    assert action.contact_name is None
    assert action.contact_phone == "+1-555-9876"


def test_reservation_action_party_size_validation():
    """Test that party_size is validated (1-20)."""
    # Test minimum valid
    data_min = {
        "action": "send_reservation_request",
        "restaurant_id": "123",
        "restaurant_name": "Test Restaurant",
        "npub": "npub1test123",
        "party_size": 1,
        "iso_time": "2025-10-30T19:00:00-07:00",
    }
    action_min = ReservationAction(**data_min)
    assert action_min.party_size == 1
    
    # Test maximum valid
    data_max = {
        "action": "send_reservation_request",
        "restaurant_id": "123",
        "restaurant_name": "Test Restaurant",
        "npub": "npub1test123",
        "party_size": 20,
        "iso_time": "2025-10-30T19:00:00-07:00",
    }
    action_max = ReservationAction(**data_max)
    assert action_max.party_size == 20
    
    # Test below minimum
    with pytest.raises(ValidationError):
        ReservationAction(
            action="send_reservation_request",
            restaurant_id="123",
            restaurant_name="Test Restaurant",
            npub="npub1test123",
            party_size=0,
            iso_time="2025-10-30T19:00:00-07:00",
        )
    
    # Test above maximum
    with pytest.raises(ValidationError):
        ReservationAction(
            action="send_reservation_request",
            restaurant_id="123",
            restaurant_name="Test Restaurant",
            npub="npub1test123",
            party_size=21,
            iso_time="2025-10-30T19:00:00-07:00",
        )


def test_reservation_action_required_fields():
    """Test that required fields are enforced."""
    # Missing party_size
    with pytest.raises(ValidationError):
        ReservationAction(
            action="send_reservation_request",
            restaurant_id="123",
            restaurant_name="Test Restaurant",
            npub="npub1test123",
            iso_time="2025-10-30T19:00:00-07:00",
        )
    
    # Missing iso_time
    with pytest.raises(ValidationError):
        ReservationAction(
            action="send_reservation_request",
            restaurant_id="123",
            restaurant_name="Test Restaurant",
            npub="npub1test123",
            party_size=2,
        )

