-- RPC to compute DAU from version_pings, grouped by date in a given timezone
-- Returns rows of (date TEXT, unique_users BIGINT)
CREATE OR REPLACE FUNCTION public.get_dau(p_since TIMESTAMPTZ, p_tz TEXT DEFAULT 'America/New_York')
RETURNS TABLE(date TEXT, unique_users BIGINT) AS $$
BEGIN
  RETURN QUERY
    SELECT
      (created_at AT TIME ZONE p_tz)::date::text AS date,
      COUNT(DISTINCT user_id) AS unique_users
    FROM public.version_pings
    WHERE created_at >= p_since
    GROUP BY 1
    ORDER BY 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
