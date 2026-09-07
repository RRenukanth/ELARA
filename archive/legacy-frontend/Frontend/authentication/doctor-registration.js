const doctorForm =

document.getElementById(
"doctorForm"
);



doctorForm.addEventListener(

"submit",

function(event){

event.preventDefault();


alert(

"Registration Request Submitted Successfully.\n\nYour account will be verified by the Administrator."

);



console.log(

"Doctor Registration Request Submitted."

);



/*

Future Architecture


Doctor Registration

↓

NodeJS API

↓

MySQL Database

↓

Store Documents

↓

Status = Pending

↓

Admin Dashboard

↓

Approve/Reject

↓

Status Updated

↓

Email Notification

↓

Doctor Login Enabled

*/


/*

Future Redirection


window.location.href=

"pending.html";


*/


doctorForm.reset();


}


);



console.log(

"Doctor Registration Module Started"

);