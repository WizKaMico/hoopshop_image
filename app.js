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


const { exec } = require('child_process');
const fs = require('fs');
const mysql = require('mysql');
const cron = require('node-cron');

const dbConnection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'hoop_test',
});

dbConnection.connect((error) => {
  if (error) {
    console.error('Error connecting to the database:', error);
    return;
  }

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
    const insertQuery = 'INSERT INTO images (filename, upload_status) VALUES (?, ?)';
    dbConnection.query(insertQuery, [imageName, 'pending'], (error, results) => {
      if (error) {
        callback(error, null);
      } else {
        callback(null, results.insertId);
      }
    });
  }

  function updateDatabaseWithGitHubUrl(imageName, githubUrl, callback) {
    const updateQuery = 'UPDATE images SET github_url = ?, upload_status = ? WHERE filename = ?';
    dbConnection.query(updateQuery, [githubUrl, 'uploaded', imageName], (error, results) => {
      if (error) {
        callback(error, null);
      } else {
        callback(null, results);
      }
    });
  }

  function moveAndPushToGitHub(imagePath, imageName, callback) {
    const newFilePath = `${uploadedFolder}/${imageName}`;
    const commitMessage = `Add ${imageName}`;

    fs.rename(imagePath, newFilePath, (renameError) => {
      if (renameError) {
        callback(renameError);
        return;
      }

      exec(`git add ${uploadedFolder}/${imageName} && git commit -m "${commitMessage}" && git push`, (error, stdout, stderr) => {
        if (error) {
          callback(error);
          return;
        }

        const githubUrl = `https://raw.githubusercontent.com/WizKaMico/hoopshop_image/main/uploaded_images/${imageName}`;

        updateDatabaseWithGitHubUrl(imageName, githubUrl, (updateError, updateResults) => {
          if (updateError) {
            callback(updateError);
          } else {
            callback(null);
          }
        });
      });
    });
  }

  function processImages() {
    fs.readdir(imagesFolder, (readError, files) => {
      if (readError) {
        console.error('Error reading folder:', readError);
        return;
      }

      let pendingOperations = files.length;

      files.forEach((imageName) => {
        const imagePath = `${imagesFolder}/${imageName}`;

        if (imageName.match(/\.(jpg|jpeg|png|gif)$/i)) {
          imageExistsInDatabase(imageName, (databaseError, exists) => {
            if (databaseError) {
              console.error('Database error:', databaseError);
            } else {
              if (!exists) {
                insertImageIntoDatabase(imageName, (insertError, insertId) => {
                  if (insertError) {
                    console.error('Error inserting image into database:', insertError);
                  } else {
                    moveAndPushToGitHub(imagePath, imageName, (moveError) => {
                      if (moveError) {
                        console.error('Error moving and pushing to GitHub:', moveError);
                      }
                      pendingOperations--;
                      if (pendingOperations === 0) {
                        dbConnection.end();
                      }
                    });
                  }
                });
              } else {
                pendingOperations--;
                if (pendingOperations === 0) {
                  dbConnection.end();
                }
              }
            }
          });
        }
      });
    });
  }

  cron.schedule('*/2 * * * *', () => {
    processImages();
  });
});

