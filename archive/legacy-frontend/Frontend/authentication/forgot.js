/*======================================
        GET HTML ELEMENTS
======================================*/


const forgotForm =

document.getElementById(
"forgotForm"
);


const email =

document.getElementById(
"email"
);



/*======================================
        EMAIL VALIDATION
======================================*/


function validateEmail(emailValue)
{

const pattern =

/^[^\s@]+@[^\s@]+\.[^\s@]+$/;


return pattern.test(
emailValue
);


}



/*======================================
        DISPLAY ERROR
======================================*/


function displayError(message)
{

alert(message);

}



/*======================================
        DISPLAY SUCCESS
======================================*/


function displaySuccess(message)
{

alert(message);

}



/*======================================
            SEND OTP
======================================*/


function sendOTP()
{

const emailValue =

email.value.trim();



if(emailValue === "")
{

displayError(
"Please enter your email address."
);

return;

}



if(!validateEmail(emailValue))
{

displayError(
"Please enter a valid email address."
);

return;

}



console.log(

"Email Verified"

);


console.log(

"Sending OTP..."

);



displaySuccess(

"OTP has been sent successfully."

);



/*

Future Flow


Email

↓

NodeJS API

↓

Verify User

↓

Generate OTP

↓

Send Email

↓

Store OTP

↓

OTP Verification

↓

Reset Password

*/


/*

Future Redirection


window.location.href=

"otp.html";


*/


}




/*======================================
            SUBMIT BUTTON
======================================*/


forgotForm.addEventListener(

"submit",

function(event)
{

event.preventDefault();

sendOTP();

}


);




/*======================================
            APPLICATION STARTED
======================================*/


console.log(

"Forgot Password Module Started"

);