//=================================================
//              IMPORT MODULES
//=================================================

const bcrypt = require("bcrypt");

const db = require("../database/db");


//=================================================
//          REGISTER PATIENT CONTROLLER
//=================================================

const registerPatient = async(req,res)=>{


try{


//===============================================
//          GET DATA FROM FRONTEND
//===============================================


const{

username,

password,

first_name,

last_name,

email,

age,

sex,

phone_number

}

= req.body;



//===============================================
//              VALIDATION
//===============================================


if(

!username ||

!password ||

!first_name ||

!last_name ||

!email ||

!age ||

!sex

){

return res.status(400).json({

message:

"Please Fill All Required Fields."

});

}



//===============================================
//      CHECK WHETHER USERNAME EXISTS
//===============================================


const usernameQuery =

"SELECT * FROM Patients WHERE username=?";


db.query(

usernameQuery,

[username],

async(error,result)=>{


if(error){

return res.status(500).json({

message:

"Database Error.",

error

});

}



if(result.length >0){

return res.status(400).json({

message:

"Username Already Exists."

});

}



//===============================================
//              HASH PASSWORD
//===============================================


const hashedPassword =

await bcrypt.hash(password,10);



//===============================================
//          INSERT INTO DATABASE
//===============================================


const insertQuery =


`INSERT INTO Patients(

username,

password,

first_name,

last_name,

email,

age,

sex,

phone_number,

registration_date

)

VALUES(?,?,?,?,?,?,?,?,CURDATE())`;




db.query(

insertQuery,

[

username,

hashedPassword,

first_name,

last_name,

email,

age,

sex,

phone_number

],

(error,result)=>{


if(error){

return res.status(500).json({

message:

"Registration Failed.",

error

});

}



return res.status(201).json({

message:

"Registration Successful."

});


}


);



}


);



}


catch(error){


return res.status(500).json({

message:

"Server Error.",

error

});


}



};




//=================================================
//              EXPORT MODULE
//=================================================


module.exports={

registerPatient

};