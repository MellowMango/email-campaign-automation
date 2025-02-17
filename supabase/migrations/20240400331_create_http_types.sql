-- Create http_response type
CREATE TYPE http_response AS (
    status integer,
    content text,
    headers jsonb
);
