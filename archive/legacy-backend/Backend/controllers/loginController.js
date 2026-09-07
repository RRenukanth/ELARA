// IMPORT MODULES
const bcrypt = require("bcrypt");
const db = require("../database/db");


// LOGIN CONTROLLER
const loginPatient = (req,res)=>{


try{


//===============================================
//          GET DATA FROM FRONTEND
//===============================================


const{

username,

password

}

= req.body;



//===============================================
//              VALIDATION
//===============================================


if(

!username ||

!password

){

return res.status(400).json({

message:

"Please Enter Username and Password."

});

}



//===============================================
//          CHECK USERNAME EXISTS
//===============================================


const query =

"SELECT * FROM Patients WHERE username=?";


db.query(

query,

[username],

async(error,result)=>{


//===========================================
//          DATABASE ERROR
//===========================================


if(error){

return res.status(500).json({

message:

"Database Error.",

error

});

}



//===========================================
//          USER NOT FOUND
//===========================================


if(result.length ===0){

return res.status(404).json({

message:

"Username Not Found."

});

}



//===========================================
//          GET PATIENT DETAILS
//===========================================


const patient = result[0];




//===========================================
//          COMPARE PASSWORD
//===========================================


const passwordMatched =

await bcrypt.compare(

password,

patient.password

);



//===========================================
//          WRONG PASSWORD
//===========================================


if(!passwordMatched){

return res.status(401).json({

message:

"Incorrect Password."

});

}



//===========================================
//              LOGIN SUCCESS
//===========================================


return res.status(200).json({


message:

"Login Successful.",


patient_id:

patient.patient_id,


username:

patient.username,


first_name:

patient.first_name,


last_name:

patient.last_name,


email:

patient.email,


age:

patient.age,


sex:

patient.sex,


status:

patient.status


});


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

loginPatient

};