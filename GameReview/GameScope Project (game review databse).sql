-- ============================================================
-- DATABASE
-- ============================================================

create database if not exists game_reviews
    character set utf8mb4 collate utf8mb4_general_ci;

use game_reviews;

-- ============================================================
-- USERS
-- Passwords must be stored as securely generated password hashes,
-- never as plaintext.
-- ============================================================

create table if not exists users(
    user_id int unsigned auto_increment not null,
    username varchar(255) not null,
    email varchar(255) not null,
    password_hash varchar(255) not null,
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp
        on update current_timestamp,

    primary key (user_id),
    unique key uq_users_username (username),
    unique key uq_users_email (email)
) ENGINE = InnoDB;

-- A user can have both roles. The application should add the player role at
-- signup and add the developer role when the user requests developer access.
create table if not exists user_roles(
    user_id int unsigned not null,
    role enum('player', 'developer') not null,

    primary key (user_id, role),
    constraint fk_user_roles_user_id
        foreign key (user_id)
        references users(user_id)
        on update cascade
        on delete cascade
) ENGINE = InnoDB;

-- ============================================================
-- USER PRIORITIES
-- Importance scores are from 1 (not important) to 5 (must-have).
-- A user can save one score for each category.
-- ============================================================

create table if not exists user_priorities(
    user_id int unsigned not null,
    category enum(
        'performance_stability',
        'story_immersion',
        'multiplayer',
        'price_value'
    ) not null,
    importance tinyint unsigned not null,
    updated_at timestamp not null default current_timestamp
        on update current_timestamp,

    primary key (user_id, category),
    constraint chk_user_priorities_importance
        check (importance between 1 and 5),
    constraint fk_user_priorities_user_id
        foreign key (user_id)
        references users(user_id)
        on update cascade
        on delete cascade
) ENGINE = InnoDB;

-- ============================================================
-- DEVELOPER PROFILES
-- Developer status is stored in user_roles. Organization affiliation is
-- tracked separately in organization_memberships.
-- ============================================================

create table if not exists developer_profiles(
    user_id int unsigned not null,
    organization_type enum('indie', 'company', 'organization', 'other') null,
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp
        on update current_timestamp,

    primary key (user_id),
    constraint fk_developer_profiles_user_id
    foreign key (user_id)
    references users(user_id)
    on update cascade
    on delete cascade
) ENGINE = InnoDB;

-- ============================================================
-- GAMES
-- ============================================================

create table if not exists games(
    game_id int unsigned auto_increment not null,
    app_id int unsigned not null,
    game_name varchar(255) not null,
    game_release_date date,
    game_description text,
    game_developer varchar(255),
    game_publisher varchar(255),
    game_price decimal(10,2),
    game_early_access_release_date date null,

    primary key (game_id),
    unique key uq_games_app_id (app_id),
    index idx_game_name (game_name)
) ENGINE = InnoDB;

-- ============================================================
-- STEAM LINKS AND PLAYER LIBRARIES
-- Store the SteamID64 and public profile details only; never store Steam
-- passwords. A linked account does not guarantee its library is public.
-- ============================================================

create table if not exists steam_accounts(
    user_id int unsigned not null,
    steam_id varchar(32) not null,
    steam_display_name varchar(255) null,
    profile_url varchar(512) null,
    linked_at timestamp not null default current_timestamp,

    primary key (user_id),
    unique key uq_steam_accounts_steam_id (steam_id),
    constraint fk_steam_accounts_user_id
        foreign key (user_id)
        references users(user_id)
        on update cascade
        on delete cascade
) ENGINE = InnoDB;


create table if not exists player_games(
    user_id int unsigned not null,
    game_id int unsigned not null,
    source enum('steam', 'manual') not null,
    playtime_forever_minutes bigint unsigned null,
    last_synced_at timestamp null,

    primary key (user_id, game_id),
    constraint fk_player_games_user_id
        foreign key (user_id)
        references users(user_id)
        on update cascade
        on delete cascade,
    constraint fk_player_games_game_id
        foreign key (game_id)
        references games(game_id)
        on update cascade
        on delete cascade,
    index idx_player_games_game_id (game_id)
) ENGINE = InnoDB;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

create table if not exists organizations(
    organization_id int unsigned auto_increment not null,
    organization_name varchar(255) not null,
    created_by_user_id int unsigned not null,
    created_at timestamp not null default current_timestamp,

    primary key (organization_id),
    index idx_organizations_name (organization_name),
    constraint fk_organizations_created_by
        foreign key (created_by_user_id)
        references users(user_id)
        on update cascade
        on delete restrict
) ENGINE = InnoDB;

create table if not exists organization_memberships(
    organization_id int unsigned not null,
    user_id int unsigned not null,
    organization_email varchar(255) null,
    joined_at timestamp not null default current_timestamp,
    
    primary key (organization_id, user_id),
    constraint fk_org_memberships_organization_id
        foreign key (organization_id)
        references organizations(organization_id)
        on update cascade
        on delete cascade,
    constraint fk_org_memberships_user_id
        foreign key (user_id)
        references users(user_id)
        on update cascade
        on delete cascade,
    index idx_org_memberships_user_status
        (user_id, affiliation_status)
) ENGINE = InnoDB;

create table if not exists organization_games(
    organization_id int unsigned not null,
    game_id int unsigned not null,
    relationship enum('developed', 'published', 'owned') not null,
    added_by_user_id int unsigned null,
    added_at timestamp not null default current_timestamp,

    primary key (organization_id, game_id, relationship),
    constraint fk_org_games_organization_id
        foreign key (organization_id)
        references organizations(organization_id)
        on update cascade
        on delete cascade,
    constraint fk_org_games_game_id
        foreign key (game_id)
        references games(game_id)
        on update cascade
        on delete cascade,
    constraint fk_org_games_added_by
        foreign key (added_by_user_id)
        references users(user_id)
        on update cascade
        on delete set null,
    index idx_org_games_game_id (game_id)
) ENGINE = InnoDB;


-- ============================================================
-- REVIEWS
-- ============================================================

create table if not exists reviews(
    game_id int unsigned not null,
	review_id varchar(255) not null,
    review_text text,
    recommended boolean not null,
    playtime_hours  decimal(10,2) not null,
    playtime_at_review_hours decimal(10,2) not null,
    helpful_votes int not null default 0,
    language varchar(50),
    written_during_early_access boolean not null default false,
    created_at datetime,
    updated_at datetime,

    primary key (review_id),
    foreign key (game_id) 
    references games(game_id)
    on update cascade
    on delete cascade,

    index idx_revs_game_id (game_id),
    index idx_play_hours (playtime_hours),
    index idx_play_hours_at_review (playtime_at_review_hours),
    index idx_helpful_votes (helpful_votes),
    index idx_language (language),
    index idx_recommended (recommended),
    index idx_revs_game_created (game_id, created_at)
) ENGINE = InnoDB;


-- ============================================================
-- GAME UPDATES
-- Developer announcements from Steam, collected by steam_updates.py
-- ============================================================

create table if not exists game_updates(
    update_id varchar(32) not null,
    game_id int unsigned not null,
    title varchar(255) not null,
    url varchar(512),
    posted_at datetime not null,
    is_patch_notes boolean not null default false,

    primary key (update_id),
    foreign key (game_id)
    references games(game_id)
    on update cascade
    on delete cascade,

    index idx_updates_game_posted (game_id, posted_at)
) ENGINE = InnoDB;


-- ============================================================
-- IMPORTING_REVIEWS
-- ============================================================

create table if not exists reviews_import(
    import_id int unsigned auto_increment not null,
    game_id int unsigned not null,
    source_filename varchar(255) not null,
    import_started_at timestamp not null default current_timestamp,
    import_completed_at timestamp null default null,
    reviews_in_file int unsigned not null default 0,
    reviews_imported int unsigned not null default 0,
    reviews_skipped int unsigned not null default 0,

    status enum (
        'Started',
        'Completed',
        'Failed'
    ) not null default 'Started',

    error_message text null default null,
    primary key (import_id),

    constraint fk_imports_game_id
        foreign key (game_id)
        references games(game_id)
        on update cascade
        on delete cascade,

    index idx_imports_game_id (game_id),
    index idx_imports_date (import_started_at),
    index idx_imports_status (status)
) ENGINE = InnoDB;

-- ============================================================
-- REVIEW FILTER RUNS
-- How many reviews the junk filter removed each time a game
-- was analyzed, and why (written by pipeline.py)
-- ============================================================

create table if not exists review_filter_runs(
    run_id int unsigned auto_increment not null,
    game_id int unsigned not null,
    reviews_collected int unsigned not null default 0,
    reviews_kept int unsigned not null default 0,
    removed_reasons text,
    run_at timestamp not null default current_timestamp,

    primary key (run_id),
    foreign key (game_id)
    references games(game_id)
    on update cascade
    on delete cascade,

    index idx_filter_runs_game (game_id, run_at)
) ENGINE = InnoDB;

-- ============================================================
-- ISSUE STATUSES
-- The status a developer sets for each issue on the Issues page
-- (written by pipeline.py)
-- MIGRATION for an EXISTING database (run once; skip on a fresh install)
-- ============================================================

create table if not exists issue_statuses(
    game_id int unsigned not null,
    topic varchar(50) not null,

    status enum (
        'Detected',
        'Investigating',
        'In Progress',
        'Resolved'
    ) not null default 'Detected',

    updated_at timestamp not null default current_timestamp
        on update current_timestamp,

    primary key (game_id, topic),
    foreign key (game_id)
    references games(game_id)
    on update cascade
    on delete cascade
) ENGINE = InnoDB;
-- ============================================================
-- MIGRATION for an EXISTING database (run once; skip on a fresh install)
-- ============================================================
-- After running this updated schema against an existing database, copy
-- current roles before changing application queries:
-- insert into user_roles (user_id, role)
-- select user_id, account_type from users;
--
-- Existing developer_profiles.organization_name values should be reviewed
-- and migrated into organizations/organization_memberships before removing
-- that column. Do not treat those unreviewed names as verified affiliations.
-- alter table users
--     add unique key uq_users_username (username);
-- alter table games
--     add column game_early_access_release_date date null after game_price;
-- alter table reviews
--     add column written_during_early_access boolean not null default false after language;

show tables;

describe games;
describe reviews;
describe game_updates;
describe reviews_import;
describe review_filter_runs;
describe issue_statuses;
describe users;
describe user_roles;
describe user_priorities;
describe developer_profiles;
describe steam_accounts;
describe player_games;
describe organizations;
describe organization_memberships;
describe organization_games;

select * from games;
select * from reviews;
select * from game_updates;
select * from reviews_import;
select * from review_filter_runs;
select * from issue_statuses;
select * from users;
select * from user_roles;
select * from user_priorities;
select * from developer_profiles;
select * from steam_accounts;
select * from player_games;
select * from organizations;
select * from organization_memberships;
select * from organization_games;