-- tdt_ims schema for HRIS-KIOSK Intern Mode
-- Reconstructed from backend-php/*.php queries and docs/architecture/system-design-and-erd.md
-- (the repo does not ship a .sql dump, so review/adjust before relying on this in production)

CREATE TABLE IF NOT EXISTS departments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interns (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    department_id INT UNSIGNED NULL,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    middle_name VARCHAR(80) NULL,
    email VARCHAR(150) NULL UNIQUE,
    password VARCHAR(255) NULL,
    profile_photo VARCHAR(255) NULL,
    face_embedding LONGTEXT NULL,
    face_embedding_large LONGTEXT NULL,
    qr_code VARCHAR(255) NULL,
    status ENUM('Active','Archived') NOT NULL DEFAULT 'Active',
    face_registered_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_interns_department FOREIGN KEY (department_id) REFERENCES departments(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dtr_entries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    intern_id INT UNSIGNED NOT NULL,
    entry_date DATE NOT NULL,
    time_in TIME NULL,
    time_out TIME NULL,
    rendered_hours DECIMAL(5,2) DEFAULT 0,
    is_archived TINYINT(1) NOT NULL DEFAULT 0,
    entry_source ENUM('manual','kiosk') NOT NULL DEFAULT 'kiosk',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dtr_intern FOREIGN KEY (intern_id) REFERENCES interns(id)
        ON DELETE CASCADE,
    INDEX idx_dtr_intern_open (intern_id, time_out, is_archived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_trail (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    user_name VARCHAR(100) NULL,
    action VARCHAR(50) NULL,
    module VARCHAR(50) NULL,
    record_id INT UNSIGNED NULL,
    description TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional starter department so the kiosk has something to assign interns to
-- (this whole file only runs once, the first time the MySQL data volume is created)
INSERT INTO departments (name) VALUES ('Internship');
