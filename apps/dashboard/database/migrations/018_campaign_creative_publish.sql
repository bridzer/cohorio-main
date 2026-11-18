-- Tracks which creatives of a campaign were sent to the ad network, so the
-- builder can show per-creative published state and publish a subset.
ALTER TABLE shopify_ad_campaigns
  ADD COLUMN IF NOT EXISTS published_creative_ids TEXT[] NOT NULL DEFAULT '{}';
