/*==================================================
                APPLICATION STARTED
==================================================*/

console.log(
"Admin Dashboard Started Successfully."
);



/*==================================================
                SYSTEM INFORMATION
==================================================*/


let totalPatients = 523;

let totalDoctors = 52;

let totalPredictions = 8512;

let pendingRequests = 15;


/*==================================================
                UPDATE DASHBOARD
==================================================*/


function updateDashboard()
{


    document.getElementById(
    "patients"
    ).innerText = totalPatients;


    document.getElementById(
    "doctors"
    ).innerText = totalDoctors;


    document.getElementById(
    "predictions"
    ).innerText = totalPredictions;


    document.getElementById(
    "pending"
    ).innerText = pendingRequests;


}



/*==================================================
                INITIALIZE DASHBOARD
==================================================*/


updateDashboard();




/*==================================================
            MANAGEMENT CARD FUNCTIONS
==================================================*/


function viewPatients()
{

    console.log(
    "Opening Patient Module."
    );


    /*
    Future Redirection


    window.location.href =

    "patients.html";


    */


}



function viewDoctors()
{

    console.log(
    "Opening Doctor Module."
    );

}


function verifyDoctors()
{

    console.log(
    "Opening Verification Module."
    );

}



function viewReports()
{

    console.log(
    "Opening Reports Module."
    );

}


function viewAnalytics()
{

    console.log(
    "Opening Analytics Module."
    );

}


function viewNotifications()
{

    console.log(
    "Opening Notifications Module."
    );

}


function viewProfile()
{

    console.log(
    "Opening Profile Module."
    );

}



function monitorAI()
{

    console.log(
    "Opening AI Monitoring Module."
    );

}




/*==================================================
            NOTIFICATION COMPONENT
==================================================*/


function openNotifications()
{

    console.log(

    "Opening Notifications."

    );


    /*
        Future Module

            Notifications

                    ↓

              New Doctors

                    ↓

             High Risk Alerts

                    ↓

               New Patients

                    ↓

               AI Updates

                    ↓

               Appointment Alerts


    */

}



/*==================================================
            PROFILE COMPONENT
==================================================*/


function openProfile()
{

    console.log(

    "Opening Administrator Profile."

    );


    /*
            Profile Module

                    ↓

                Settings

                    ↓

                 Account

                    ↓

               Change Password

                    ↓

                  Logout


    */


}




/*==================================================
            RECENT ACTIVITIES
==================================================*/


let recentActivities =


[

"Doctor Registration Submitted.",

"Patient Registered Successfully.",

"High Risk Prediction Alert.",

"AI Model Updated."

];


console.log(

"Recent Activities"

);


recentActivities.forEach(

function(activity)
{

    console.log(activity);

}

);




/*==================================================
                FUTURE APIs
==================================================*/


/*

---------------------------------------------------

                PATIENT APIs

---------------------------------------------------


getPatients()

↓

NodeJS

↓

MySQL

↓

Return Total Patients


---------------------------------------------------


                DOCTOR APIs

---------------------------------------------------


getDoctors()

↓

Approved Doctors

↓

Pending Doctors

↓

Rejected Doctors


---------------------------------------------------


                AI APIs

---------------------------------------------------


getPredictions()

↓

DQN

↓

Prediction Analytics

↓

Reports


---------------------------------------------------


                IoT APIs

---------------------------------------------------


getIoTDevices()

↓

Connected Devices

↓

Offline Devices

↓

Patient Monitoring


---------------------------------------------------


            NOTIFICATION APIs

---------------------------------------------------


getNotifications()

↓

Doctor Requests

↓

Prediction Alerts

↓

Reports

↓

Messages


---------------------------------------------------


*/


/*==================================================
            DASHBOARD REFRESH
==================================================*/


function refreshDashboard()
{

    console.log(

    "Refreshing Dashboard..."

    );


    updateDashboard();


}


/*==================================================
            AUTO REFRESH (DEMO)
==================================================*/


setInterval(

function()
{

    refreshDashboard();

},

30000


);



/*==================================================
            MODULE STATUS
==================================================*/


console.log(

"Patients Module Ready."

);


console.log(

"Doctors Module Ready."

);


console.log(

"Analytics Module Ready."

);


console.log(

"Reports Module Ready."

);


console.log(

"Notification Module Ready."

);


console.log(

"Profile Module Ready."

);


console.log(

"AI Monitoring Module Ready."

);


console.log(

"Admin Dashboard Loaded Successfully."

);
