/*==================================================
                GET HTML ELEMENTS
==================================================*/

const registerForm = document.getElementById("registerForm");

const firstName = document.getElementById("firstName");

const lastName = document.getElementById("lastName");

const email = document.getElementById("email");

const password = document.getElementById("password");

const confirmPassword =
document.getElementById("confirmPassword");

const age = document.getElementById("age");

const gender = document.getElementById("gender");

const phone = document.getElementById("phone");

const emergencyContact =
document.getElementById("emergencyContact");


/*==================================================
                EMAIL VALIDATION
==================================================*/

function validateEmail(emailValue)
{

    const pattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return pattern.test(emailValue);

}


/*==================================================
            PASSWORD VALIDATION
==================================================*/

function validatePassword(passwordValue)
{

    /*
        Requirements

        Minimum 8 characters

    */

    if(passwordValue.length < 8)
    {
        return false;
    }

    return true;

}


/*==================================================
            PHONE VALIDATION
==================================================*/

function validatePhone(phoneValue)
{

    const pattern =
    /^[0-9]{10}$/;

    return pattern.test(phoneValue);

}



/*==================================================
                AGE VALIDATION
==================================================*/

function validateAge(ageValue)
{

    if(ageValue < 1 || ageValue > 120)
    {
        return false;
    }

    return true;

}



/*==================================================
                DISPLAY ERROR
==================================================*/

function displayError(message)
{

    alert(message);

}



/*==================================================
            DISPLAY SUCCESS
==================================================*/

function displaySuccess(message)
{

    alert(message);

}



/*==================================================
                REGISTER USER
==================================================*/

function registerUser()
{


    const firstNameValue =
    firstName.value.trim();

    const lastNameValue =
    lastName.value.trim();

    const emailValue =
    email.value.trim();

    const passwordValue =
    password.value.trim();

    const confirmPasswordValue =
    confirmPassword.value.trim();

    const ageValue =
    age.value.trim();

    const genderValue =
    gender.value;

    const phoneValue =
    phone.value.trim();

    const emergencyValue =
    emergencyContact.value.trim();



    /*------------------------------------
            EMPTY FIELD VALIDATION
    -------------------------------------*/


    if(firstNameValue === "")
    {
        displayError(
            "Please enter your first name."
        );

        return;
    }


    if(lastNameValue === "")
    {
        displayError(
            "Please enter your last name."
        );

        return;
    }


    if(emailValue === "")
    {
        displayError(
            "Please enter your email."
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


    if(confirmPasswordValue === "")
    {
        displayError(
            "Please confirm your password."
        );

        return;
    }


    if(ageValue === "")
    {
        displayError(
            "Please enter your age."
        );

        return;
    }


    if(genderValue === "")
    {
        displayError(
            "Please select your gender."
        );

        return;
    }


    if(phoneValue === "")
    {
        displayError(
            "Please enter your phone number."
        );

        return;
    }


    if(emergencyValue === "")
    {
        displayError(
            "Please enter an emergency contact number."
        );

        return;
    }




    /*------------------------------------
                EMAIL VALIDATION
    -------------------------------------*/


    if(!validateEmail(emailValue))
    {

        displayError(
            "Please enter a valid email address."
        );

        return;

    }



    /*------------------------------------
            PASSWORD VALIDATION
    -------------------------------------*/


    if(!validatePassword(passwordValue))
    {

        displayError(
            "Password must contain at least 8 characters."
        );

        return;

    }



    /*------------------------------------
            PASSWORD MATCHING
    -------------------------------------*/


    if(passwordValue !== confirmPasswordValue)
    {

        displayError(
            "Passwords do not match."
        );

        return;

    }




    /*------------------------------------
                AGE VALIDATION
    -------------------------------------*/


    if(!validateAge(ageValue))
    {

        displayError(
            "Please enter a valid age."
        );

        return;

    }



    /*------------------------------------
            PHONE VALIDATION
    -------------------------------------*/


    if(!validatePhone(phoneValue))
    {

        displayError(
            "Please enter a valid phone number."
        );

        return;

    }


    if(!validatePhone(emergencyValue))
    {

        displayError(
            "Please enter a valid emergency contact number."
        );

        return;

    }




    /*------------------------------------
            REGISTRATION SUCCESS
    -------------------------------------*/


    console.log("Registration Successful");


    console.log("User Details");

    console.log(firstNameValue);

    console.log(lastNameValue);

    console.log(emailValue);

    console.log(ageValue);

    console.log(genderValue);



    /*
    ======================================

            FUTURE API STRUCTURE

    ======================================


            registerAPI()

                    ↓

                NodeJS

                    ↓

                 MySQL

                    ↓

            Email Verification

                    ↓

               Send OTP

                    ↓

              Verify OTP

                    ↓

              Encrypt Password

                    ↓

               Create Account

                    ↓

              Login Successful

    ======================================

    */



    displaySuccess(
        "Registration Successful."
    );



    /*
    -------------------------------------

            FUTURE REDIRECTION

    -------------------------------------


    window.location.href =

    "otp.html";


    or


    window.location.href =

    "login.html";


    --------------------------------------

    */


}



/*==================================================
            REGISTER BUTTON
==================================================*/

registerForm.addEventListener(

    "submit",

    function(event)
    {

        event.preventDefault();

        registerUser();

    }

);




/*==================================================
            LOGIN PAGE REDIRECTION
==================================================*/

const loginLink =

document.querySelector(
".login-link a"
);


loginLink.addEventListener(

    "click",

    function()
    {

        console.log(
        "Opening Login Page."
        );

    }

);



/*==================================================
                APPLICATION STARTED
==================================================*/

console.log(

"Patient Registration Module Started"

);