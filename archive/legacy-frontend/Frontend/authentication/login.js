/*=========================================
            GET FORM ELEMENTS
=========================================*/

const loginForm = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");


/*=========================================
            EMAIL VALIDATION
=========================================*/

function validateEmail(emailValue){
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailPattern.test(emailValue);
}


/*=========================================
            PASSWORD VALIDATION
=========================================*/

function validatePassword(passwordValue)
{

    /*
    Minimum Requirements

    8 Characters

    */

    if(passwordValue.length < 8)
    {
        return false;
    }

    return true;

}



/*=========================================
            DISPLAY ERROR
=========================================*/


function displayError(message)
{

    alert(message);

}



/*=========================================
            LOGIN FUNCTION
=========================================*/


function loginUser()
{

    const emailValue = email.value.trim();

    const passwordValue =
    password.value.trim();


    /*--------------------------
        CHECK EMPTY FIELDS
    ---------------------------*/

    if(emailValue === "")
    {

        displayError(
            "Please enter your email address."
        );

        return;
    }


    if(passwordValue === "")
    {

        displayError(
            "Please enter your password."
        );

        return;
    }



    /*--------------------------
        EMAIL VALIDATION
    ---------------------------*/


    if(!validateEmail(emailValue))
    {

        displayError(
            "Please enter a valid email address."
        );

        return;
    }



    /*--------------------------
        PASSWORD VALIDATION
    ---------------------------*/


    if(!validatePassword(passwordValue))
    {

        displayError(
            "Password must contain at least 8 characters."
        );

        return;
    }



    /*--------------------------
        LOGIN SUCCESS
    ---------------------------*/


    console.log("Login Successful");


    console.log(
        "Email : ",
        emailValue
    );


    /*
        Backend Integration

        Example:

        fetch("/api/login")

        Email

        Password

        ↓

        JWT TOKEN

        ↓

        User Role

        ↓

        Patient

        or

        Doctor

        or

        Admin

    */



    alert("Login Successful.");



    /*--------------------------

        FUTURE REDIRECTION

    ---------------------------*/


    /*
        if(userRole === "Patient")
        {

            window.location.href =

            "../Patient/dashboard.html";

        }


        else if(userRole === "Doctor")
        {

            window.location.href =

            "../Doctor/dashboard.html";

        }


        else if(userRole === "Admin")
        {

            window.location.href =

            "../Admin/dashboard.html";

        }

    */


}




/*=========================================
            LOGIN BUTTON
=========================================*/


loginForm.addEventListener(
    "submit",

    function(event)
    {

        event.preventDefault();

        loginUser();

    }

);




/*=========================================
            GUEST LOGIN
=========================================*/


const guestButton =

document.querySelector(".guest-btn");


guestButton.addEventListener(

    "click",

    function()
    {

        alert(
            "Guest Mode will be available soon."
        );

    }

);



/*=========================================
            FORGOT PASSWORD
=========================================*/


const forgotPassword =

document.querySelector(
".remember-forgot a"
);


forgotPassword.addEventListener(

    "click",

    function(event)
    {

        event.preventDefault();

        alert(

        "Redirecting to Forgot Password Page."

        );

    }

);




/*=========================================
            SIGN UP
=========================================*/


const signUpButton =

document.querySelector(
".register a"
);


signUpButton.addEventListener(

    "click",

    function()
    {

        console.log(

            "Opening Register Page"

        );

    }

);




/*=========================================
            APPLICATION STARTED
=========================================*/


console.log(

"Heart Disease Prediction System Started"

);