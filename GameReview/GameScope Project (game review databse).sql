-- ============================================================
-- DATABASE
-- ============================================================

create database if not exists game_reviews
    character set utf8mb4 collate utf8mb4_general_ci;

use game_reviews;

-- ============================================================
-- GAMES
-- For testing purposes, get rid of the not nulls because it
-- forces us to provide values for them
-- ============================================================

create table if not exists games(
    game_id int unsigned auto_increment not null,
    app_id int unsigned not null,
    game_name varchar(255) not null,
    game_release_date date not null,
    game_description text,
    game_developer varchar(255) not null,
    game_publisher varchar(255),
    game_price decimal(10,2) not null,

    primary key (game_id),
    index idx_game_name (game_name)
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
    index idx_recommended (recommended)
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

show tables;

describe games;
describe reviews;
describe reviews_import;

select * from games;
select * from reviews;
select * from reviews_import;