// Load the global mining footprints feature collection
var mining_footprints = ee.FeatureCollection("projects/sat-io/open-datasets/global-mining/global_mining_footprints");

// Define the geometry for South Africa
var southAfrica = ee.Geometry.Polygon(
  [
    [
      [16.344976840895535, -34.795136889945564],
      [16.344976840895535, -22.12505933673603],
      [32.900836465895535, -22.12505933673603],
      [32.900836465895535, -34.795136889945564]
    ]
  ],
  null,
  false
);

// Filter the mining footprints to only include data within South Africa
var mining_footprints_sa = mining_footprints.filterBounds(southAfrica);

// Create a binary mask where mining footprints are 1 and background is 0
var mining_mask = mining_footprints_sa.reduceToImage({
  properties: ['mining_status'],
  reducer: ee.Reducer.anyNonZero()
}).rename('mining_mask');

// Load Sentinel-2 data for South Africa for the year 2023
var sentinel2 = ee.ImageCollection("COPERNICUS/S2")
                  .filterBounds(southAfrica)
                  .filterDate('2023-01-01', '2023-12-31');  // Set the date range

// Function to add Sentinel-2 bands and mining mask to an image
var addBandsAndMask = function(image) {
  // Select Sentinel-2 bands of interest
  var bands = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B10', 'B11', 'B12'];
  
  // Add Sentinel-2 bands
  var imageWithBands = image.select(bands).rename(bands);
  
  // Add the mining mask
  var mining_mask = mining_footprints_sa.reduceToImage({
    properties: ['mining_status'],
    reducer: ee.Reducer.anyNonZero()
  }).clip(image.geometry()).rename('mining_mask');
  
  return imageWithBands.addBands(mining_mask);
};

var bands = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B10', 'B11', 'B12']

// Map the function over the Sentinel-2 image collection
var sentinel2_with_mask = sentinel2.map(addBandsAndMask);

// Sample points within the mining footprints and background areas
var samples = sentinel2_with_mask.select(bands)  // Select bands here
                 .addBands(ee.Image.pixelLonLat())
                 .stratifiedSample({
                   numPoints: 2000,  // Adjust the number of points as needed
                   classBand: 'mining_mask',
                   region: southAfrica,
                   scale: 10,
                 });

// Export the training data to Google Drive as CSV
Export.table.toDrive({
  collection: samples,
  description: 'mining_footprints_training_data',
  fileFormat: 'CSV'
});

// Function to export images and masks
var exportImagesAndMasks = function(image) {
  // Get the date of the image
  var date = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd');
  
  // Create an image with Sentinel-2 bands and mining mask
  var imageWithMask = addBandsAndMask(image);

  // Export the image
  Export.image.toDrive({
    image: imageWithMask.select(bands)  // Select bands here
                         .addBands(imageWithMask.select('mining_mask')),
    description: 'image_' + date,
    folder: 'data',  // Adjust the folder name as needed
    region: southAfrica,
    scale: 10,
    fileFormat: 'GeoTIFF',
  });

  // Export the mining mask
  Export.image.toDrive({
    image: imageWithMask.select('mining_mask'),
    description: 'mask_' + date,
    folder: 'masks',  // Adjust the folder name as needed
    region: southAfrica,
    scale: 10,
    fileFormat: 'GeoTIFF',
  });
};

// Map over the Sentinel-2 image collection and export images and masks
sentinel2_with_mask.map(exportImagesAndMasks);