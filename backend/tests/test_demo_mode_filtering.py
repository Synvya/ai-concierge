"""Test demo mode filtering functionality."""
from __future__ import annotations

from app.repositories.sellers import _should_exclude_seller


def test_exclude_demo_profiles_in_normal_mode():
    """Test that demo profiles are excluded when show_demo_only is None or False."""
    # Demo profile with hashtag_demo=true
    demo_seller = {
        "id": "demo-seller-1",
        "name": "Demo Restaurant",
        "meta_data": {
            "hashtag_demo": True,
            "environment": "production",
        }
    }
    
    # Normal mode (show_demo_only=None): should exclude demo profiles
    assert _should_exclude_seller(demo_seller, show_demo_only=None) is True
    
    # Normal mode (show_demo_only=False): should exclude demo profiles
    assert _should_exclude_seller(demo_seller, show_demo_only=False) is True


def test_exclude_demo_profiles_with_hashtags_array():
    """Test that demo profiles are excluded when hashtags array contains 'demo'."""
    demo_seller = {
        "id": "demo-seller-2",
        "name": "Demo Cafe",
        "meta_data": {
            "hashtags": ["demo", "local", "business"],
            "environment": "production",
        }
    }
    
    # Normal mode: should exclude
    assert _should_exclude_seller(demo_seller, show_demo_only=None) is True


def test_exclude_demo_profiles_with_environment():
    """Test that profiles with environment='demo' are excluded in normal mode."""
    demo_seller = {
        "id": "demo-seller-3",
        "name": "Demo Bistro",
        "meta_data": {
            "environment": "demo",
        }
    }
    
    # Normal mode: should exclude
    assert _should_exclude_seller(demo_seller, show_demo_only=None) is True


def test_include_production_profiles_in_normal_mode():
    """Test that production profiles are included in normal mode."""
    production_seller = {
        "id": "prod-seller-1",
        "name": "Real Restaurant",
        "meta_data": {
            "hashtag_demo": False,
            "environment": "production",
        }
    }
    
    # Normal mode: should include (not exclude) production profiles
    assert _should_exclude_seller(production_seller, show_demo_only=None) is False


def test_exclude_production_profiles_in_demo_mode():
    """Test that production profiles are excluded when show_demo_only=True."""
    production_seller = {
        "id": "prod-seller-2",
        "name": "Real Cafe",
        "meta_data": {
            "environment": "production",
        }
    }
    
    # Demo mode: should exclude non-demo profiles
    assert _should_exclude_seller(production_seller, show_demo_only=True) is True


def test_include_demo_profiles_in_demo_mode():
    """Test that demo profiles are included when show_demo_only=True."""
    demo_seller = {
        "id": "demo-seller-4",
        "name": "Demo Restaurant",
        "meta_data": {
            "hashtag_demo": True,
            "environment": "production",
        }
    }
    
    # Demo mode: should include (not exclude) demo profiles
    assert _should_exclude_seller(demo_seller, show_demo_only=True) is False


def test_demo_flag_in_filters():
    """Test that demo flag in filters field is also detected."""
    demo_seller = {
        "id": "demo-seller-5",
        "name": "Demo Shop",
        "filters": {
            "hashtag_demo": True,
        }
    }
    
    # Normal mode: should exclude
    assert _should_exclude_seller(demo_seller, show_demo_only=None) is True
    
    # Demo mode: should include (not exclude)
    assert _should_exclude_seller(demo_seller, show_demo_only=True) is False


def test_classified_listings_always_excluded():
    """Test that classified listings are always excluded regardless of demo mode."""
    classified_listing = {
        "id": "classified-1",
        "name": "Listing",
        "meta_data": {
            "type": "classified_listing",
            "hashtag_demo": True,
        }
    }
    
    # Should be excluded in both modes
    assert _should_exclude_seller(classified_listing, show_demo_only=None) is True
    assert _should_exclude_seller(classified_listing, show_demo_only=True) is True
    
    # Test with filters field
    classified_with_filters = {
        "id": "classified-2",
        "name": "Listing",
        "filters": {
            "type": "classified_listing",
        }
    }
    
    assert _should_exclude_seller(classified_with_filters, show_demo_only=None) is True
    assert _should_exclude_seller(classified_with_filters, show_demo_only=True) is True


def test_seller_without_metadata():
    """Test handling of sellers without meta_data or filters."""
    minimal_seller = {
        "id": "minimal-seller",
        "name": "Minimal Restaurant",
    }
    
    # Should not be excluded (no demo flags found)
    assert _should_exclude_seller(minimal_seller, show_demo_only=None) is False
    
    # In demo mode, should be excluded (not a demo profile)
    assert _should_exclude_seller(minimal_seller, show_demo_only=True) is True


def test_case_insensitive_demo_detection():
    """Test that demo detection is case-insensitive."""
    demo_seller_mixed_case = {
        "id": "demo-seller-6",
        "name": "Demo Place",
        "meta_data": {
            "hashtags": ["Demo", "LOCAL"],
            "environment": "DEMO",
        }
    }
    
    # Normal mode: should exclude
    assert _should_exclude_seller(demo_seller_mixed_case, show_demo_only=None) is True
    
    # Demo mode: should include (not exclude)
    assert _should_exclude_seller(demo_seller_mixed_case, show_demo_only=True) is False

