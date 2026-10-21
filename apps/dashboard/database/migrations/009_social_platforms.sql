ALTER TABLE social_posts
  DROP CONSTRAINT IF EXISTS social_posts_platform_check;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_platform_check
    CHECK (platform IN ('LinkedIn', 'X', 'Instagram', 'TikTok', 'Facebook'));
