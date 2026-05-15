-- local manual API verification seed
--
-- Inserts the minimum data needed to call:
-- - POST /api/recordings/init
--
-- The final SELECT prints IDs to reuse in curl requests.

WITH new_building AS (
  INSERT INTO buildings (name)
  VALUES ('Local Dev Building')
  RETURNING id
),
new_floor AS (
  INSERT INTO floors (building_id, level, name, image_object_path)
  SELECT
    id,
    1,
    '1F',
    'maps/' || id || '/11111111-1111-4111-8111-111111111111.png'
  FROM new_building
  RETURNING id
),
new_pedestrian AS (
  INSERT INTO pedestrians DEFAULT VALUES
  RETURNING id
)
SELECT
  (SELECT id FROM new_building) AS building_id,
  (SELECT id FROM new_floor) AS floor_id,
  (SELECT id FROM new_pedestrian) AS pedestrian_id;
