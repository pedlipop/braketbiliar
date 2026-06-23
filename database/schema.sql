-- PostgreSQL Database Schema for Tournament Bracket Management System

CREATE TABLE IF NOT EXISTS tournaments (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'Draft', -- Draft, Seeded, Started, Completed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS participants (
    id VARCHAR(50) PRIMARY KEY,
    tournament_id VARCHAR(50) REFERENCES tournaments(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    company_id VARCHAR(100) NOT NULL,
    seed INT NOT NULL,
    UNIQUE(tournament_id, company_id)
);

CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(50) PRIMARY KEY,
    tournament_id VARCHAR(50) REFERENCES tournaments(id) ON DELETE CASCADE,
    round INT NOT NULL,
    match_index INT NOT NULL,
    p1_id VARCHAR(50) REFERENCES participants(id) ON DELETE SET NULL,
    p2_id VARCHAR(50) REFERENCES participants(id) ON DELETE SET NULL,
    score1 NUMERIC DEFAULT NULL,
    score2 NUMERIC DEFAULT NULL,
    winner_id VARCHAR(50) REFERENCES participants(id) ON DELETE SET NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    p1_source_match_id VARCHAR(50),
    p2_source_match_id VARCHAR(50),
    dest_match_id VARCHAR(50),
    dest_param VARCHAR(10),
    side VARCHAR(10),
    is_third_place BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS history_logs (
    id SERIAL PRIMARY KEY,
    tournament_id VARCHAR(50) REFERENCES tournaments(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL,
    details TEXT,
    state_snapshot JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
