const { exec } = require('child_process');
const fs = require('fs');
const mysql = require('mysql');
const cron = require('node-cron');

let dbConnection;

function openDbConnection() {
  dbConnection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'hoop_test',
  });

  dbConnection.connect((err) => {
    if (err) {
      console.error('Error connecting to database:', err);
    } else {
      console.log('Connected to database.');
      processImages();
    }
  });
}

function imageExistsInDatabase(imageName, callback) {
  if (dbConnection && dbConnection.state === 'authenticated') {
    const query = 'SELECT id FROM images WHERE filename = ?';
    dbConnection.query(query, [imageName], (error, results) => {
      if (error) {
        callback(error, null);
      } else {
        callback(null, results.length > 0);
      }
    });
  } else {
    callback(new Error('Database connection not available'), null);
  }
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
  const newFilePath = `./uploaded_images/${imageName}`;
  const commitMessage = `Add ${imageName}`;

  fs.rename(imagePath, newFilePath, (renameError) => {
    if (renameError) {
      callback(renameError);
      return;
    }

    console.log('Image moved to uploaded folder.');

    exec(`git add ./uploaded_images/${imageName} && git commit -m "${commitMessage}" && git push`, (error, stdout, stderr) => {
      if (error) {
        callback(error);
        return;
      }

      console.log('Pushed to GitHub successfully:', stdout);

      const githubUrl = `https://raw.githubusercontent.com/WizKaMico/hoopshop_image/main/uploaded_images/${imageName}`;

      updateDatabaseWithGitHubUrl(imageName, githubUrl, (updateError, updateResults) => {
        if (updateError) {
          callback(updateError);
        } else {
          console.log('Database updated with GitHub URL:', updateResults);
          callback(null);
        }
      });
    });
  });
}

function processImages() {
  fs.readdir('./images', (readError, files) => {
    if (readError) {
      console.error('Error reading folder:', readError);
      return;
    }

    let pendingOperations = files.length;

    files.forEach((imageName) => {
      const imagePath = `./images/${imageName}`;

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
                  console.log('Image inserted into database with ID:', insertId);
                  moveAndPushToGitHub(imagePath, imageName, (moveError) => {
                    if (moveError) {
                      console.error('Error moving and pushing to GitHub:', moveError);
                    }
                    pendingOperations--;
                    if (pendingOperations === 0) {
                      // No more pending operations
                      console.log('All pending operations completed.');
                    }
                  });
                }
              });
            } else {
              console.log(`Image '${imageName}' already exists in the database. Skipping processing.`);
              pendingOperations--;
              if (pendingOperations === 0) {
                // No more pending operations
                console.log('All pending operations completed.');
              }
            }
          }
        });
      }
    });
  });
}

// Open the database connection at the start
openDbConnection();

// Schedule cron job
cron.schedule('*/2 * * * *', () => {
  // Check if the database connection is open before processing images
  if (dbConnection && dbConnection.state === 'authenticated') {
    processImages();
  } else {
    console.error('Database connection not available.');
  }
});

