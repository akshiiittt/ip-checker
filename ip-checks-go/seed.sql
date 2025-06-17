INSERT INTO restrictions (id, category, scope, value, code, state, created_at, updated_at) VALUES
(1, 'whitelist', 'country', 'US', NULL, 'enabled', NOW(), NOW()),
(2, 'blacklist', 'ip', '192.168.1.10', 403, 'enabled', NOW(), NOW()),
(3, 'maintenance', 'continent', 'EU', 503, 'enabled', NOW(), NOW()),
(4, 'blocklogin', 'country', 'CN', 403, 'enabled', NOW(), NOW()),
(5, 'blacklist', 'ip_subnet', '10.0.0.0/24', 403, 'enabled', NOW(), NOW());