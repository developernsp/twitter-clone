const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbpath = path.join(__dirname, "twitterClone.db");
app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Db Error : ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//POST Register User details API-1

app.post("/register/", async (request, response) => {
  const { name, username, password, gender } = request.body;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
  const previousUserDetails = await db.get(selectUserQuery);

  if (previousUserDetails === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
            INSERT INTO
                user(name, username, password, gender)
            VALUES(
                "${name}",
                "${username}",
                "${hashedPassword}",
                "${gender}");`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//POST Login User and (create & validate jwt token) API--2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
  const previousUserDetails = await db.get(selectUserQuery);

  if (previousUserDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      previousUserDetails.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secretToken");
      response.send({ jwtToken });
      console.log({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Middleware Token

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secretToken", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//GET Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
//API--3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
  const loggedInUserdetails = await db.get(selectUserQuery);
  const { user_id } = loggedInUserdetails;

  const getLatestFourTweetsQuery = `
    SELECT 
        username,
        tweet,
        date_time AS dateTime
    FROM (follower INNER JOIN tweet 
    ON follower.following_user_id = tweet.user_id) AS T
    INNER JOIN user ON T.user_id = user.user_id
    where T.follower_user_id = "${user_id}"
    ORDER BY dateTime DESC
    LIMIT 4
    OFFSET 0;`;
  const tweetsList = await db.all(getLatestFourTweetsQuery);
  response.send(tweetsList);
});

//GET list of persons the user followed API--4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
  const loggedInUserDetails = await db.get(selectUserQuery);
  const { user_id } = loggedInUserDetails;

  const getUserFollowingListQuery = `
    SELECT name
    FROM user
    INNER JOIN follower ON
    user.user_id = follower.following_user_id
    WHERE follower_user_id = "${user_id}";`;

  const followingList = await db.all(getUserFollowingListQuery);
  response.send(followingList);
});

//GET User Followers List API API--5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
  const loggedInUserDetails = await db.get(selectUserQuery);
  const { user_id } = loggedInUserDetails;

  const getFollowersList = `
    SELECT name
    FROM user INNER JOIN follower
    ON user.user_id = follower.follower_user_id
    WHERE following_user_id = "${user_id}";`;

  const followersList = await db.all(getFollowersList);
  response.send(followersList);
});

//GET Tweet based ob tweet id if the current user follows that person who tweeted API--6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const getTweetUser = `
  SELECT user_id AS tweet_user_id
  FROM tweet
  WHERE tweet_id = "${tweetId}";`;

  const tweetUser = await db.get(getTweetUser);
  const { tweet_user_id } = tweetUser;

  //loggedInUser
  const { username } = request;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
  const loggedInUserDetails = await db.get(selectUserQuery);
  const { user_id } = loggedInUserDetails;

  const getCurrentUserFollowingList = `
        SELECT follower_id
        FROM follower
        WHERE follower_user_id = "${user_id}";`;
  const followingList = await db.all(getCurrentUserFollowingList);

  const userFollowingList = followingList;
  //console.log(userFollowingList);

  if (userFollowingList[0] === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetDetails1 = `
    SELECT 
       tweet,
       COUNT(tweet) AS likes
    FROM tweet INNER JOIN like
    ON tweet.tweet_id = like.tweet_id
    WHERE tweet.tweet_id = "${tweetId}";`;
    const tweetDetails1 = await db.all(getTweetDetails1);
    // response.send(tweetDetails);

    const getTweetDetails2 = `
    SELECT 
       COUNT(tweet) AS replies,
       date_time AS dateTime
    FROM tweet INNER JOIN reply
    ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = "${tweetId}";`;
    const tweetDetails2 = await db.all(getTweetDetails2);

    const result1 = tweetDetails1[0];
    const result2 = tweetDetails2[0];

    const result = {
      ...result1,
      ...result2,
    };
    if (result.tweet === null) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(result);
    }
  }
});

//GET list of liked users of a given tweet API

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const getTweetUser = `
  SELECT user_id AS tweet_user_id
  FROM tweet
  WHERE tweet_id = "${tweetId}";`;

    const tweetUser = await db.get(getTweetUser);
    const { tweet_user_id } = tweetUser;

    //loggedInUser
    const { username } = request;

    const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
    const loggedInUserDetails = await db.get(selectUserQuery);
    const { user_id } = loggedInUserDetails;

    const getCurrentUserFollowingList = `
        SELECT follower_id
        FROM follower
        WHERE follower_user_id = "${user_id}";`;
    const followingList = await db.all(getCurrentUserFollowingList);

    const userFollowingList = followingList;
    //console.log(userFollowingList);

    if (userFollowingList[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikedUsers = `
        SELECT 
            username
        FROM like NATURAL JOIN user
        WHERE tweet_id = "${tweetId}";`;
      const likedUsers = await db.all(getLikedUsers);
      // response.send(likedUsers);
      let listOfUsers = [];
      for (f of likedUsers) {
        listOfUsers.push(f.username);
      }

      if (listOfUsers[0] !== undefined) {
        response.send({ likes: listOfUsers });
      } else {
        response.status(401);
        response.send("Invalid Request");
      }
    }
  }
);

//GET Replies of a tweet if the requested user is following to that tweet user API

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const getTweetUser = `
  SELECT user_id AS tweet_user_id
  FROM tweet
  WHERE tweet_id = "${tweetId}";`;

    const tweetUser = await db.get(getTweetUser);
    const { tweet_user_id } = tweetUser;

    //loggedInUser
    const { username } = request;

    const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
    const loggedInUserDetails = await db.get(selectUserQuery);
    const { user_id } = loggedInUserDetails;

    const getCurrentUserFollowingList = `
        SELECT follower_id
        FROM follower
        WHERE follower_user_id = "${user_id}";`;
    const followingList = await db.all(getCurrentUserFollowingList);

    const userFollowingList = followingList;
    //console.log(userFollowingList);

    if (userFollowingList.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getReplyUsers = `
        SELECT 
            name,
            reply
        FROM reply NATURAL JOIN user
        WHERE tweet_id = "${tweetId}";`;
      const replyUsers = await db.all(getReplyUsers);
      // response.send(likedUsers);

      let repliesList = [];
      for (f of replyUsers) {
        repliesList.push(f);
      }

      if (repliesList[0] !== undefined) {
        response.send({ replies: repliesList });
        // console.log({ replies: repliesList });
      } else {
        response.status(401);
        response.send("Invalid Request");
      }
    }
  }
);

/*
//GET All tweets of the loggedInUser API

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
  const loggedInUserDetails = await db.get(selectUserQuery);
  const { user_id } = loggedInUserDetails;
  // console.log(user_id);

  const getTweetDetailsQuery = `
       SELECT
         tweet_id AS tweetId
        FROM tweet 
        WHERE user_id = "${user_id}";`;

  const tweetDetails = await db.all(getTweetDetailsQuery);
  //response.send(tweetDetails);
  //console.log(tweetDetails);

  const likesQuery = `
        select
            *
         from (like INNER JOIN reply
         ON like.tweet_id = reply.tweet_id) AS T
         WHERE T.tweet_id = 4;
    `;
  const likes = await db.all(likesQuery);
  //console.log(likes);
  response.send(likes);
});
*/

//POST create new tweet and to database API

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  //loggedInUser
  const { username } = request;

  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
  const loggedInUserDetails = await db.get(selectUserQuery);
  const { user_id } = loggedInUserDetails;

  const addTweetQuery = `
        INSERT INTO tweet(tweet, user_id)
        VALUES(
            "${tweet}",
            "${user_id}");`;
  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

//DELETE tweet if a tweet belongs to loggedInUser API--11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    //loggedInUser
    const { username } = request;

    const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";`;
    const loggedInUserDetails = await db.get(selectUserQuery);
    const { user_id } = loggedInUserDetails;

    //console.log(user_id);

    const getTweetsOfUser = `
        SELECT 
            tweet_id
         FROM tweet
         WHERE user_id = "${user_id}";`;
    const tweets = await db.all(getTweetsOfUser);

    let tweetsList = [];
    for (f of tweets) {
      tweetsList.push(f.tweet_id);
    }

    let tweetIdInt = parseInt(tweetId);

    if (tweetsList.includes(tweetIdInt)) {
      const deleteTweetQuery = `
            DELETE 
            FROM tweet
            WHERE tweet_id = "${tweetIdInt}";`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
      console.log(typeof tweetIdInt);
    }
  }
);

module.exports = app;
