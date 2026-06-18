# SAT Math Extension Tutor

# Demo vid of the extension
[![Math SAT Tutor Browser Extension](https://img.youtube.com/vi/P65vH11gNVw/0.jpg)](https://www.youtube.com/watch?v=P65vH11gNVw)

## if youre not running on mac just copy paste this "read me" to chatgpt for whatever youre on
## How to install for mac (run the commands in terminal)

### Download the zip file from this repo
Download satmathextension-main.zip to your desktop or wherever you can easily access
### Install ollama ( if you havent)
curl -fsSL https://ollama.com/install.sh | sh

RUN THIS COMMAND BELOW BEFORE YOU START UP OLLLMA to prevent 403 error: 

launchctl setenv OLLAMA_ORIGINS "*"

IF OLLAMAS ALREADY RUNNING, QUIT IT, AND RUN THAT COMMAND THEN START ollama again!


### Download models to use locally for the tutor
command for the chat model i used: ollama pull qwen2.5:7b

command for the vision model i used: ollama pull qwen2.5vl:7b

you can always download your own and then put it in the popup of the extension
### Install extension to browser
go to chrome://extensions/ if youreon google 

or edge://extensions/ if on edge


then turn on developer mode


click on load unpacked then select the "satmathextension-main" folder and press select
### now you can use this extension and edit to your liking
