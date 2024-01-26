// const cron = require('node-cron');
// const bodyParser = require('body-parser');
// const express = require('express');
// const axios = require('axios');

// const app = express();
// const port = process.env.PORT || 3005;

// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

// const accessToken = 'EAAWiGqtpC2kBO75ZBLIm9m2PO8z52ReRncxT3TKCAPsd3yThykXMSKAET2EbiBoP7n6GEUH9RYZBlC0LKrKZA1RLe4orpINfRmctSstGffUU00x90y3xvxAsIA0MwnSP0O95yio1IBpdzuoYE9g3bOPsOMQHBN9ZA6KVac2bnT8pgZBOZCZAliIOAwoVcvdUZAzA9LEGKgV7HnskKwyv2etMDUIZD';
// const pageId = '136968512827904';
// const message = 'TEST NODE JS';
// const baseAttachmentUrl = 'https://thumbs.dreamstime.com/b/michael-jordan-chicago-bulls-legend-taking-free-throw-image-taken-color-slide-73861834.jpg';

// let isPostScheduled = false;

// async function postToFacebook() {
//   try {
//     // Append timestamp to the attachment URL to ensure uniqueness
//     const timestamp = new Date().getTime();
//     const attachmentUrl = `${baseAttachmentUrl}?timestamp=${timestamp}`;

//     // Post with the attachment and message
//     const postResponse = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
//       url: attachmentUrl,
//       caption: message,  // Using 'caption' for the message
//       access_token: accessToken,
//     });

//     console.log('Post successful:', postResponse.data);
//   } catch (error) {
//     console.error('Error posting to Facebook:', error.response ? error.response.data : error.message);
//   } finally {
//     isPostScheduled = false;
//   }
// }

// // Schedule the job to run every 2 minutes
// cron.schedule('*/2 * * * *', () => {
//   if (!isPostScheduled) {
//     postToFacebook();
//     isPostScheduled = true;
//   }
// });

// // Start the server
// app.listen(port, () => console.log(`Server is running on port ${port}`));

const fs = require('fs');
const axios = require('axios');
const mysql = require('mysql');

const githubUsername = 'WizKaMico';
const githubRepo = 'hoopshop_image';
const githubToken = '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';
const githubBranch = 'main';

const dbConnection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'hoop_test',
});

const imagesFolder = './images';
const uploadedFolder = './uploaded_images';

function imageExistsInDatabase(imageName, callback) {
  const query = 'SELECT id FROM images WHERE filename = ?';
  dbConnection.query(query, [imageName], (error, results) => {
    if (error) {
      callback(error, null);
    } else {
      callback(null, results.length > 0);
    }
  });
}

function insertImageIntoDatabase(imageName, callback) {
  const insertQuery = 'INSERT INTO images (filename) VALUES (?)';
  dbConnection.query(insertQuery, [imageName], (error, results) => {
    if (error) {
      callback(error, null);
    } else {
      callback(null, results.insertId);
    }
  });
}

function uploadImageToGitHub(imagePath, imageName) {
    const apiUrl = `https://api.github.com/repos/${githubUsername}/${githubRepo}/contents/${imageName}`;
    const imageData = fs.readFileSync(imagePath);
    const base64Image = Buffer.from(imageData).toString('base64');
  
    return axios.put(apiUrl, {
      message: 'Upload image to GitHub',
      content: base64Image,
      branch: githubBranch,
    }, {
      headers: {
        Authorization: `token ${githubToken}`,
      },
    });
  }
  
  // Function to update the database with GitHub URL
  function updateDatabaseWithGitHubUrl(imageName, githubUrl) {
    const updateQuery = 'UPDATE images SET github_url = ? WHERE filename = ?';
  
    dbConnection.query(updateQuery, [githubUrl, imageName], (error, results) => {
      if (error) {
        console.error('Error updating database with GitHub URL:', error);
      } else {
        console.log('Database updated with GitHub URL:', results);
      }
    });
  }
  
  // Function to move image to the uploaded folder
  function moveImageToUploadedFolder(imagePath, imageName) {
    const newFilePath = `${uploadedFolder}/${imageName}`;
  
    fs.rename(imagePath, newFilePath, (renameError) => {
      if (renameError) {
        console.error('Error moving the image:', renameError);
      } else {
        console.log('Image moved to uploaded folder.');
      }
    });
  }

fs.readdir(imagesFolder, (readError, files) => {
  if (readError) {
    console.error('Error reading folder:', readError);
    dbConnection.end();  // Close the database connection on error
    return;
  }

  let pendingOperations = files.length;

  files.forEach((imageName) => {
    const imagePath = `${imagesFolder}/${imageName}`;

    // Check if the file is an image
    if (imageName.match(/\.(jpg|jpeg|png|gif)$/i)) {
      // Check if the image already exists in the database
      imageExistsInDatabase(imageName, (databaseError, exists) => {
        if (databaseError) {
          console.error('Database error:', databaseError);
          pendingOperations--;
          if (pendingOperations === 0) {
            dbConnection.end();  // Close the database connection when all operations are done
          }
          return;
        }

        if (!exists) {
          // Image doesn't exist in the database, insert it
          insertImageIntoDatabase(imageName, (insertError, insertId) => {
            if (insertError) {
              console.error('Error inserting image into database:', insertError);
            } else {
              console.log('Image inserted into database with ID:', insertId);
              
              // Continue with uploading, updating, and moving
              uploadImageToGitHub(imagePath, imageName)
                .then((response) => {
                  const githubUrl = response.data.content.html_url;
  
                  // Update database with GitHub URL
                  updateDatabaseWithGitHubUrl(imageName, githubUrl);
  
                  // Move image to uploaded folder
                  moveImageToUploadedFolder(imagePath, imageName);
                })
                .catch((uploadError) => {
                  console.error('Error uploading image to GitHub:', uploadError.response ? uploadError.response.data : uploadError.message);
                });
            }

            pendingOperations--;
            if (pendingOperations === 0) {
              dbConnection.end();  // Close the database connection when all operations are done
            }
          });
        } else {
          // Image already exists in the database, skip processing
          console.log(`Image '${imageName}' already exists in the database. Skipping processing.`);

          pendingOperations--;
          if (pendingOperations === 0) {
            dbConnection.end();  // Close the database connection when all operations are done
          }
        }
      });
    }
  });
});
