/*==================================================
            APPLICATION STARTED
==================================================*/

console.log(
"Patient Dashboard Started Successfully."
);



/*==================================================
                PATIENT DETAILS
==================================================*/


let patientName =

"John Smith";


let patientID =

"P001";



/*==================================================
                IoT DEVICE STATUS
==================================================*/


let deviceStatus =

"Connected";


let batteryStatus =

"90 %";


let signalStrength =

"Excellent";


let lastUpdated =

"5 Seconds Ago";



/*==================================================
                HEALTH DETAILS
==================================================*/


let heartRate =

78;


let bloodPressure =

"120 / 80";


let spo2 =

98;


let predictionStatus =

"LOW RISK";



/*==================================================
                INITIALIZE
==================================================*/


function initializeDashboard()
{

    console.log(

    "Loading Patient Dashboard."

    );


    console.log(

    "Patient Name :",

    patientName

    );


    console.log(

    "Device Status :",

    deviceStatus

    );



}



/*==================================================
            IoT DEVICE MODULE
==================================================*/


function connectIoTDevice()
{

    console.log(

    "Connecting IoT Device."

    );


}


function getHeartRate()
{

    console.log(

    "Fetching Heart Rate."

    );


}


function getBloodPressure()
{

    console.log(

    "Fetching Blood Pressure."

    );


}


function getSpO2()
{

    console.log(

    "Fetching SpO2."

    );


}



/*==================================================
            UPDATE INFORMATION
==================================================*/


function updateInformation()
{

    console.log(

    "Updating Patient Information."

    );


    /*
            Future API


            Age

             ↓

           Gender

             ↓

        Chest Pain

             ↓

      Exercise Pain

             ↓

            MySQL

             ↓

      Update Database


    */


}



/*==================================================
            MAKE PREDICTION
==================================================*/


function makePrediction()
{


    console.log(

    "Making Prediction."

    );



    /*

            IoT Data

                ↓

            Heart Rate

                ↓

        Blood Pressure

                ↓

                ECG

                ↓

            Old Peak

                ↓

              Slope

                ↓

            Patient Data

                ↓

                Age

                ↓

              Gender

                ↓

            Chest Pain

                ↓

          Exercise Pain

                ↓

               API

                ↓

          RL Prediction

                ↓

            Explainable AI

                ↓

             LOW RISK

              MEDIUM

             HIGH RISK

                ↓

            Dashboard

    */


}



/*==================================================
            PREDICTION MODULE
==================================================*/


function getPrediction()
{

    console.log(

    "Fetching Prediction."

    );



}


function getConfidenceLevel()
{

    console.log(

    "Fetching Confidence Level."

    );


}


function getRecommendation()
{

    console.log(

    "Fetching Recommendation."

    );


}


function getPatientExplanation()
{

    console.log(

    "Fetching Patient Explanation."

    );


}



/*==================================================
            HISTORY MODULE
==================================================*/


function getPredictionHistory()
{

    console.log(

    "Fetching Prediction History."

    );


}


function getHealthHistory()
{

    console.log(

    "Fetching Health History."

    );


}



/*==================================================
                SIDEBAR MENU
==================================================*/


const menuButton =

document.querySelector(
".menu-icon"
);


const sidebar =

document.querySelector(
".sidebar"
);



if(menuButton)
{

    menuButton.addEventListener(

        "click",

        function()
        {

            sidebar.classList.toggle(
            "active"
            );

        }

    );

}



/*==================================================
            PROFILE MODULE
==================================================*/


function openProfile()
{

    console.log(

    "Opening Profile."

    );

}


function openSettings()
{

    console.log(

    "Opening Settings."

    );

}


function logout()
{

    console.log(

    "Logging Out."

    );


}



/*==================================================
                NOTIFICATIONS
==================================================*/


function getNotifications()
{

    console.log(

    "Fetching Notifications."

    );


}



/*==================================================
                FUTURE APIs
==================================================*/


/*

--------------------------------------------------

                PATIENT APIs

--------------------------------------------------


getPatientProfile()

↓

updateInformation()

↓

getPredictionHistory()


--------------------------------------------------


                IOT APIs

--------------------------------------------------


connectIoTDevice()

↓

getHeartRate()

↓

getBloodPressure()

↓

getSpO2()

↓

getECG()


--------------------------------------------------


                AI APIs

--------------------------------------------------


makePrediction()

↓

RL Prediction

↓

Explainable AI

↓

Recommendation

↓

Prediction Result


--------------------------------------------------


            HISTORY APIs

--------------------------------------------------


getHealthHistory()

↓

getPredictionHistory()


--------------------------------------------------


                MYSQL

--------------------------------------------------


Patient Information

↓

IoT Data

↓

Predictions

↓

History

↓

Doctor Recommendation



--------------------------------------------------

*/



/*==================================================
            AUTO REFRESH DASHBOARD
==================================================*/


function refreshDashboard()
{

    console.log(

    "Refreshing Dashboard."

    );


    initializeDashboard();


}


setInterval(

function()
{

    refreshDashboard();

},

30000);



/*==================================================
                INITIALIZE
==================================================*/


initializeDashboard();



/*==================================================
                MODULE STATUS
==================================================*/


console.log(

"IoT Module Ready."

);


console.log(

"Prediction Module Ready."

);


console.log(

"History Module Ready."

);


console.log(

"Profile Module Ready."

);


console.log(

"Settings Module Ready."

);


console.log(

"Notification Module Ready."

);


console.log(

"Patient Dashboard Loaded Successfully."

);