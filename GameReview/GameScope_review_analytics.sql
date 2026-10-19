USE game_reviews;

-- One summary row per game, including games that do not have reviews yet.
-- Positive/negative are based on the Steam recommended flag.
-- Playtime at review time is the primary average; current playtime is also
-- included because the schema stores both values.
SELECT
    g.game_id,
    g.app_id,
    g.game_name,

-- Average playtime at review time
    ROUND(AVG(r.playtime_at_review_hours), 2)
        AS average_playtime_at_review_hours,

-- Average current playtime 
    ROUND(AVG(r.playtime_hours), 2)
        AS average_current_playtime_hours,

-- Count of positive reviews
    COUNT(CASE WHEN r.recommended = TRUE THEN 1 END)
        AS positive_reviews,

-- Count of negative reviews
    COUNT(CASE WHEN r.recommended = FALSE THEN 1 END)
        AS negative_reviews,

-- Count of total reviews and percentages of positive and negative reviews
    COUNT(r.review_id)
        AS total_reviews,

-- positive reviews = positive review count / total review count * 100, rounded to 2 decimal places
-- COALESCE(calculated_percentage, 0.00)
-- ROUND(percentage_calculation, 2)
-- returns 0.00 if calculation is null
    COALESCE(
        ROUND(
            100.0 * COUNT(CASE WHEN r.recommended = TRUE THEN 1 END)
            / NULLIF(COUNT(r.review_id), 0),
            2
        ),
        0.00
    ) AS positive_review_percentage,

    COALESCE(
        ROUND(
            100.0 * COUNT(CASE WHEN r.recommended = FALSE THEN 1 END)
            / NULLIF(COUNT(r.review_id), 0),
            2
        ),
        0.00
    ) AS negative_review_percentage
    
FROM games AS g

-- left join so that it includes even games that don't have reviews yet
LEFT JOIN reviews AS r
    ON r.game_id = g.game_id

-- group reviews by game
GROUP BY
    g.game_id,
    g.app_id,
    g.game_name

-- sort the results
ORDER BY
    g.game_name,
    g.game_id;
