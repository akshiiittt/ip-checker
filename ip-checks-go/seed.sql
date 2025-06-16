INSERT INTO restrictions (id, category, scope, value, code, state, created_at, updated_at) VALUES
(1, 'blacklist', 'ip', '1.2.3.4', NULL, 'enabled', NOW(), NOW()),
(2, 'whitelist', 'country', 'US', NULL, 'enabled', NOW(), NOW()),
(3, 'maintenance', 'continent', 'EU', NULL, 'enabled', NOW(), NOW()),
(4, 'blocklogin', 'ip_subnet', '192.168.1.0/24', NULL, 'enabled', NOW(), NOW()),
(5, 'blacklist', 'all', 'all', NULL, 'enabled', NOW(), NOW());