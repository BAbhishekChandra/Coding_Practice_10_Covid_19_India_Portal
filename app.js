const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// Logger Middleware Functions
const logger = (request, response, next) => {
  console.log(request.query);
  next();
};

// AuthenticateToken Middleware Function
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
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        console.log(payload);
        request.username = payload.username;
        next();
      }
    });
  }
};

//User Register API
app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender, location) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        )`;
    await db.run(createUserQuery);
    response.send(`User created successfully`);
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Profile API
app.get("/profile/", authenticateToken, async (request, response) => {
  let { username } = request;
  console.log(username);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(selectUserQuery);
  response.send(userDetails);
});

// GET API1 List all States
app.get("/states/", authenticateToken, async (request, response) => {
  const getAllStatesQuery = `SELECT * FROM state ORDER BY state_id;`;
  const statesArray = await db.all(getAllStatesQuery);
  //response.send(statesArray);
  const ans = (statesArray) => {
    return {
      stateId: statesArray.state_id,
      stateName: statesArray.state_name,
      population: statesArray.population,
    };
  };
  response.send(statesArray.map((eachState) => ans(eachState)));
});

// Get API2 List one State based on the Given ID
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId}`;
  const state = await db.get(getStateQuery);
  response.send({
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  });
});

// POST API3 Creating a district to district Table.
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  //console.log(districtDetails);
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  //console.log(`${districtName}, ${stateId}, ${cases}, ${cured}, ${active}, ${deaths}`);
  const addDirectorQuery = `INSERT INTO district (district_name, state_id, cases, cured, active, deaths) 
    VALUES ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`;
  const dbResponse = await db.run(addDirectorQuery);
  const districtId = dbResponse.lastID;
  response.send("District Successfully Added");
});

// GET API4 Returns a district on districtId.
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId}`;
    const districtDetails = await db.get(getDistrictQuery);
    response.send({
      districtId: districtDetails.district_id,
      districtName: districtDetails.district_name,
      stateId: districtDetails.state_id,
      cases: districtDetails.cases,
      cured: districtDetails.cured,
      active: districtDetails.active,
      deaths: districtDetails.deaths,
    });
  }
);

// DELETE API5 Deleting district based on the district_id.
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ${districtId}`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

// PUT API6 Updating details of specific district based on district_id.
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    //console.log(districtId);
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    //console.log(`${districtName}, ${stateId}, ${cases}, ${cured}, ${active}, ${deaths}`);
    const updateDistrictDetails = ` 
    UPDATE district 
    SET district_name = '${districtName}', state_id = ${stateId}, cases = '${cases}' , cured = ${cured}, active = ${active}, deaths = ${deaths}
    WHERE district_id = ${districtId};`;
    await db.run(updateDistrictDetails);
    response.send("District Details Updated");
  }
);

// GET API7 Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `SELECT SUM(cases), SUM(cured), SUM(active), SUM(deaths) FROM district WHERE state_id = ${stateId};`;
    const stats = await db.get(getStateStatsQuery);
    //console.log(stats);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

// GET API8 Returns an object containing the state name of a district based on the district ID
app.get(
  "/districts/:districtId/details/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictIdQuery = `SELECT state_id FROM district WHERE district_id = ${districtId};`;
    //With this we will get the state_id using district table
    const getDistrictIdQueryResponse = await db.get(getDistrictIdQuery);
    const getStateNameQuery = `SELECT state_name as stateName FROM state WHERE state_id = ${getDistrictIdQueryResponse.state_id};`;
    //With this we will get state_name as stateName using the state_id
    const getStateNameQueryResponse = await db.get(getStateNameQuery);
    response.send(getStateNameQueryResponse); // Sending the required Response.
  }
);

module.exports = app;
