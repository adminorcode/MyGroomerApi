WITH inserted_categories AS (
    INSERT INTO categories (name, description) VALUES
        ('Car Wash', 'Professional vehicle cleaning and detailing'),
        ('Home Cleaning', 'Residential cleaning services'),
        ('Office Cleaning', 'Commercial and workspace cleaning')
    RETURNING id, name
)
INSERT INTO services (name, description, category_id)
SELECT s.name, s.description, ic.id
FROM inserted_categories ic
JOIN (VALUES
    ('Car Wash', 'Exterior Wash', 'Quick exterior hand wash'),
    ('Car Wash', 'Full Detailing', 'Interior and exterior deep clean'),
    ('Home Cleaning', 'Standard Cleaning', 'General home cleaning'),
    ('Home Cleaning', 'Deep Cleaning', 'Thorough top-to-bottom clean'),
    ('Office Cleaning', 'Daily Office Clean', 'Routine workspace cleaning')
) AS s(category_name, name, description)
ON ic.name = s.category_name;

INSERT INTO users (name, email, password, role, email_verified_at)
VALUES (
    'Admin',
    'admin@tiodepet.local',
    '$2b$10$WxmqWhicOrbJIRZ2ntNVJeP7IggxgO.CjDkf8ChAWdWmNT72eSpfG',   -- password:admin123
    'admin',
    NOW()
);