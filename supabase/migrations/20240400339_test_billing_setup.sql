-- Function to run billing setup tests
CREATE OR REPLACE FUNCTION test_billing_setup()
RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
    v_results text[];
    v_response http_response;
    v_project_url text;
    v_anon_key text;
    v_test_passed boolean;
BEGIN
    -- Test 1: Verify required extensions
    BEGIN
        PERFORM 1 FROM pg_extension WHERE extname = 'pg_net';
        v_results := array_append(v_results, 'PASS: pg_net extension is installed');
    EXCEPTION WHEN OTHERS THEN
        v_results := array_append(v_results, 'FAIL: pg_net extension is not installed - ' || SQLERRM);
        RETURN v_results;
    END;

    -- Test 2: Verify app_settings table and data
    BEGIN
        SELECT value INTO v_project_url FROM app_settings WHERE key = 'project_url';
        SELECT value INTO v_anon_key FROM app_settings WHERE key = 'anon_key';
        
        IF v_project_url IS NULL OR v_anon_key IS NULL THEN
            v_results := array_append(v_results, 'FAIL: Missing required settings in app_settings');
            RETURN v_results;
        END IF;
        
        v_results := array_append(v_results, 'PASS: app_settings table exists and contains required data');
    EXCEPTION WHEN OTHERS THEN
        v_results := array_append(v_results, 'FAIL: Error checking app_settings - ' || SQLERRM);
        RETURN v_results;
    END;

    -- Test 3: Verify logs table
    BEGIN
        INSERT INTO logs (level, message) 
        VALUES ('info', 'Test log entry')
        RETURNING true INTO v_test_passed;
        
        IF v_test_passed THEN
            v_results := array_append(v_results, 'PASS: logs table is working');
        ELSE
            v_results := array_append(v_results, 'FAIL: Could not insert into logs table');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_results := array_append(v_results, 'FAIL: Error testing logs table - ' || SQLERRM);
    END;

    -- Test 4: Test HTTP function with health check
    BEGIN
        SELECT *
        INTO v_response
        FROM http_post(
            url := v_project_url || '/functions/v1/billing-test/health',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_anon_key
            ),
            body := '{}'::jsonb
        );

        IF v_response.status = 200 THEN
            v_results := array_append(v_results, 'PASS: HTTP function test successful');
            v_results := array_append(v_results, 'Response: ' || v_response.content);
        ELSE
            v_results := array_append(v_results, 'FAIL: HTTP function test failed - Status: ' || v_response.status);
            v_results := array_append(v_results, 'Response: ' || v_response.content);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_results := array_append(v_results, 'FAIL: Error testing HTTP function - ' || SQLERRM);
    END;

    -- Test 5: Test auth header passing
    BEGIN
        SELECT *
        INTO v_response
        FROM http_post(
            url := v_project_url || '/functions/v1/billing-test/auth-test',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_anon_key
            ),
            body := '{}'::jsonb
        );

        IF v_response.status = 200 AND v_response.content::json->>'status' = 'success' THEN
            v_results := array_append(v_results, 'PASS: Auth header test successful');
        ELSE
            v_results := array_append(v_results, 'FAIL: Auth header test failed - ' || v_response.content);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_results := array_append(v_results, 'FAIL: Error testing auth headers - ' || SQLERRM);
    END;

    -- Test 6: Test billing calculation function
    BEGIN
        PERFORM invoke_billing_calculation();
        v_results := array_append(v_results, 'PASS: invoke_billing_calculation executed without errors');
    EXCEPTION WHEN OTHERS THEN
        v_results := array_append(v_results, 'FAIL: Error testing billing calculation - ' || SQLERRM);
    END;

    RETURN v_results;
END;
$$;

-- Run the tests and output results
DO $$
DECLARE
    v_test_results text[];
    v_result text;
BEGIN
    RAISE NOTICE 'Starting billing setup tests...';
    RAISE NOTICE '----------------------------';
    
    SELECT test_billing_setup() INTO v_test_results;
    
    FOREACH v_result IN ARRAY v_test_results
    LOOP
        RAISE NOTICE '%', v_result;
    END LOOP;
    
    RAISE NOTICE '----------------------------';
    RAISE NOTICE 'Tests completed.';
END;
$$; 