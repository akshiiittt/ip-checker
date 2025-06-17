CREATE TYPE CATEGORIES AS ENUM ('whitelist', 'maintenance', 'blacklist', 'blocklogin');
CREATE TYPE SCOPES AS ENUM ('continent', 'country', 'ip', 'ip_subnet', 'all');
CREATE TABLE restrictions (
    id bigint PRIMARY KEY,
    category CATEGORIES NOT NULL,
    scope SCOPES NOT NULL,
    value varchar(64) NOT NULL,
    code int,
    state varchar(50) DEFAULT 'enabled',
    created_at timestamp NOT NULL,
    updated_at timestamp NOT NULL
);