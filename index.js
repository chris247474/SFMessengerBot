'use strict'
const http = require('http')

//lightweight wrapper for common fb messenger GET POST
const Bot = require('messenger-bot')

const request = require('request')

//to access azure cloud db
//const azureMobileApps = require('azure-mobile-apps')

const express = require('express')
const bodyParser = require('body-parser')

//generic doubly linked list for more dynamic set operations
var List = require("collections/list");

//to access SQL Server on azure
var tedious = require('tedious')
var Connection = tedious.Connection;
var Request = tedious.Request;  
var TYPES = tedious.TYPES;  

//DB format result strings
var SEPARATORSTRING = '-+++-'

//microsoft azure secret files application
var azureDBConnStr = "Driver={ODBC Driver 13 for SQL Server};Server=tcp:chrisdavetv.database.windows.net,1433;Database=chrisdavetvapps;Uid=chrisdavetv@chrisdavetv;Pwd={Chrisujt5287324747@@};Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"

//postback and message events string ids
var GETSTARTEDSTRING = "Get Started"
var PostNew = "Post"
var ShowPostsString = "Read Posts"
var ShowSecretFilesString = "Browse Secret Files"
var JoinString = "Join"
var HelpPersistentMenuItem = "Help"
var SubscribeString = "Subscribe"
var HowDoesItWorkString = "How does it work?"
var TryItOutString = 'Try it out'
var CreateNewSecretFileString = "Create New Secret File"

//var GetStartedSent = false

//initialize messenger-bot
let bot = new Bot({
  token: 'EAAX2onbWfdMBAGsG7XKJIDWuuZBoPQVt0euv438fQsWrE1aRNJGxERWRR9n1QQN7upG6k3xrwwodgEdZBibLnQFGtDsA1wT8oTnSTJe5pNeL2kqquZCDM5UopTXYpoWsBfh8sO673Uz4vzV3osCVDSxJZBKvWZBfJXCUag9bRdwZDZD',
  verify: 'token'
})

// Azure Mobile Apps - SQLite3 Initialization
 //var mobile = azureMobileApps();
 
// When you connect to Azure SQL Database, you need these next options.  
var config = {  
        userName: 'chrisdavetv@chrisdavetv',  
        password: 'Chrisujt5287324747@@',  
        server: 'chrisdavetv.database.windows.net',  
        options: {
          encrypt: true, 
          database: 'chrisdavetvapps',
          rowCollectionOnRequestCompletion: true,
          rowCollectionOnDone: true
        }  
    }; 
//connection will be refused by Azure SQL Server unless you add a firewall exception for this IP address
var connection = new Connection(config);  
    connection.on('connect', function(err) {  
        // If no error, then good to proceed.  
        if(err) console.log('debug:', err)
        else console.log("Connected to Azure SQL Server "+config.server+', DB '+config.options.database);  
        //executeStatement("SELECT * FROM AccountItem");  
    });  

///////////////////////////////// SQL helper functions

function CreateNewSecretFileRecord(title, desc, imageurl) {  
    console.log('Creating a new Secret File')
    var queryRequest = new Request(
      'INSERT INTO GROUPITEM (groupName, groupDesc, groupImage, adminuserId) VALUES (@title, @desc, @image, @adminuserId)', 
    function(err) {  
      if (err) {  
          console.log(err);
        }  
    });  

    //insert values into those marked w '@'
    queryRequest.addParameter('title', TYPES.NVarChar, title);
    queryRequest.addParameter('desc', TYPES.NVarChar, desc);
    queryRequest.addParameter('image', TYPES.NVarChar, imageurl);
    queryRequest.addParameter('adminuserId', TYPES.NVarChar, '');

    connection.execSql(queryRequest);  
    console.log('CreateNewSecretFileRecord executed')
}  

/////////////////////////////////

// messenger bot initial ui and menu
createPersistentMenu()
createGetStartedButton()

//////////////////////////////// Messaging event handlers

bot.on('error', (err) => {
  console.log(err.message)
})

bot.on('message', (callbackObject, reply) => {
  console.log('received message '+callbackObject.message.text+ ' from user '+callbackObject.sender.id)

  if(callbackObject.message.quick_reply){
    // //handles quick_replies
    handleMessages(callbackObject.message.quick_reply.payload, callbackObject, reply)
  }
  else if(handleMessages(callbackObject.message.text, callbackObject, reply)){}//handles manually typed commands
  else{
    messageUserTypicalCommands(callbackObject, reply)//handles text otherwise not understood by bot
  }
})

bot.on('postback', (postbackContainer, reply, actions) => {
  var _payload = postbackContainer.postback.payload
  console.log('postback event received from user '+ postbackContainer.sender.id)
  console.log('payload: '+ _payload)
  console.log('reply: '+ reply)
  console.log('actions '+ actions)

  //check if payload is from Get Started button in greeting screen
  if(_payload == GETSTARTEDSTRING){
   ShowIntroMessage(reply)
  }

  //check if payload is a susbcribe action from ShowSecretFilesSubscriptions
  else if(_payload == SubscribeString){
    SubscribeToSecretFile(reply, 'DLSU Secret Files')//, extractSecretFileNameFromPayload(_payload))//fetch from db
  }

  //actions from hamburger icon on left of message field
  else handlePersistentMenuActions(_payload, postbackContainer.sender.id, reply)
})

///////////////////////////////

/////////////////////////////// Helper functions
function isNullOrWhitespace( input ) {

    if (typeof input === 'undefined' || input == null) return true;

    return input.replace(/\s/g, '').length < 1;
}
function handleMessages(message, callbackObject, reply){
    try{
      if(message == ShowSecretFilesString){
        console.log("ShowSecretFilesString payload condition satisfied in message event")
        ShowSecretFilesSubscriptions(callbackObject.sender.id, reply)
        return true
      }else if(message == JoinString){// || operator seems to trigger a satisfied condition on the first if statement here
        console.log("JoinString payload condition satisfied in message event")
        ShowSecretFilesSubscriptions(callbackObject.sender.id, reply)
        return true
      }
      else if(message == PostNew){
      //create new secret file via options:camera, text
      PostNewinSecretFile(reply)
        return true
      }
      else if(message == ShowPostsString){
        //show all posts from currently subscribed Secret Files
        ShowAllSubscribedPosts(callbackObject, reply)
        return true
      }
      else if(message == HowDoesItWorkString){
        console.log('HowDoesItWork condition satisfied in message event')
        ExplainSecretFiles(reply)
        return true
      }
      else if(message == TryItOutString){
        Try(reply)
        return true
      }
      else if (message == CreateNewSecretFileString){
        CreateNewSecretFile(callbackObject, reply)
        return true
      } 
    }catch(err){
      return err
    }

    return false
}

function Try(reply){
  reply({
    text: 'First we need to join an existing Secret File community, or make one if you prefer',
    quick_replies: [
      createQuickTextReply("Make my own", CreateNewSecretFileString),
      createQuickTextReply("Join", JoinString)
    ]
  }, (err, info) => {
      if(err) {
        console.log(err.message)
        throw err
      }
  })
}

function ExplainSecretFiles(reply){
  console.log('ExplainSecretFiles Activated')
  reply({
    text: 'Ever wanted to say something, but were afraid of what people might think? We\'ve all been there. '+
    'Secret Files is a place where you can say what you think your community should hear, without revealing who you are.'+
    ' Say anything you want, your Secret and identity are safe with us:)',
    quick_replies: [
      createQuickTextReply("Try it out", TryItOutString)
    ]
  }, (err, info) => {
      if(err) {
        console.log(err.message)
        throw err
      }
  })
}

function ShowIntroMessage(reply){
  reply({
    text: 'Welcome to Secret Files! Got something to say? Then shout it out for everyone to hear. Your secret is safe with us.',
    quick_replies: [
      createQuickTextReply(HowDoesItWorkString, HowDoesItWorkString)
    ]
  }, (err, info) => {
      if(err) {
        console.log(err.message)
        throw err
      }
  })
}

function handlePersistentMenuActions(_payload, senderid, reply){
  //check if payload was sent by a persistent menu item
  if(_payload == HelpPersistentMenuItem){
    messageUserTypicalCommands(_payload, reply)
  }
  else if(_payload == PostNew){
    PostNewinSecretFile(reply)
  }
  else if(_payload == ShowPostsString){
    ShowAllSubscribedPosts(_payload, reply)
  }
  else if(_payload == ShowSecretFilesString){
   ShowSecretFilesSubscriptions(senderid, reply)
  }else if(_payload == CreateNewSecretFileString){
    CreateNewSecretFile(_payload, reply)
  }
}

function SubscribeToSecretFile(reply, secretfile){
  console.log('subscribing to secretfile: '+secretfile)

  var responseMessage = 'Whenever someone posts on '+secretfile+
    ', it will appear here from now on! Here\'s what we can do next:'
    reply(
      {
        text: responseMessage, 
        quick_replies: [
          createQuickTextReply(PostNew, PostNew),
          createQuickTextReply(ShowPostsString, ShowPostsString)
        ]
      }, (err, info) => {
          if(err) {
            console.log(err.message)
            throw err
          }
    })
}

function createPersistentMenu(){
  bot.setPersistentMenu([
    {
        "type":"postback",
        "title":HelpPersistentMenuItem,
        "payload":HelpPersistentMenuItem
    },
    {
      "type":"postback",
      "title": PostNew,
      "payload": PostNew
    },
    {
      "type":"postback",
      "title": "Read Posts",
      "payload": ShowPostsString
    },
    {
      "type":"postback",
      "title": ShowSecretFilesString,
      "payload": ShowSecretFilesString
    }
  ], (err, info)=>{
    console.log('createPersistentMenu method result: '+ info.result)

    if(err){
      console.log(err.message)
      throw err
    }
  })
}

function createGetStartedButton(){
  bot.setGetStartedButton([
    {
      "payload":GETSTARTEDSTRING
    }
  ], 
  (err, info) => {
    console.log('createGetStartedButton method result: ' + info.result)
    if(err){
      console.log(err.message)
      throw err
    }
  })
}

//base version of code using facebook graph api
function addPersistentMenu(){
 request({
    url: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: { access_token: "EAAX2onbWfdMBAGsG7XKJIDWuuZBoPQVt0euv438fQsWrE1aRNJGxERWRR9n1QQN7upG6k3xrwwodgEdZBibLnQFGtDsA1wT8oTnSTJe5pNeL2kqquZCDM5UopTXYpoWsBfh8sO673Uz4vzV3osCVDSxJZBKvWZBfJXCUag9bRdwZDZD" },
    method: 'POST',
    json:{
        setting_type : "call_to_actions",
        thread_state : "existing_thread",
        call_to_actions:[
            {
              "type":"postback",
              "title":HelpPersistentMenuItem,
              "payload":HelpPersistentMenuItem
            },
            {
              "type":"postback",
              "title": PostNew,
              "payload": PostNew
            },
            {
              "type":"postback",
              "title": ShowSecretFilesString,
              "payload": ShowSecretFilesString
            }
          ]
    }

}, function(error, response, body) {
    console.log(response)
    if (error) {
        console.log('Error sending messages: ', error)
    } else if (response.body.error) {
        console.log('Error: ', response.body.error)
    }
})

}

function ShowAllSubscribedPosts(payload, reply){
  reply({
    text: "Oops! Sorry this feature is still under construction"
  }, (err, info) => {
    if(err){
      console.log(err.message)
      throw err
    }
  })
}

function PostNewinSecretFile(reply){
  GetNewPostTitle(reply)
}
function GetNewTextOnlyPost(){

}

function GetCameraPost(){
  reply({
    text: "Oops! Sorry this feature is still under construction"
  }, (err, info) => {
    if(err){
      console.log(err.message)
      throw err
    }
  })
}

function GetAudioPost(){
  reply({
    text: "Oops! Sorry this feature is still under construction"
  }, (err, info) => {
    if(err){
      console.log(err.message)
      throw err
    }
  })
}

function GetNewPostTitle(reply){
  var message = 'What should be the title of this Secret File?'
  reply({
    text: message
  }, (err, info) => {
    if(err){
      console.log(err.message)
      throw err
    }
  }) 
}

function GetNewPostBodyText(payload, reply){
  
}

function CreateNewSecretFile(payload, reply){
  //show camera, audio or text upload options
  console.log('CreateNewSecretFile function called')
  reply({
    text: "Oops! Sorry this feature is still under construction. Creating a dummy Secret File"
  }, (err, info) => {
    if(err){
      console.log(err.message)
      throw err
    }
  })

  CreateNewSecretFileRecord('Your very own Secret File', 'Description here', '')
  
  //SubscribeToSecretFile(reply, "DLSU Secret Files")
}

function createQuickTextReply(_title, _payload){
  return {
    "content_type" : "text",
    "title" : _title,
    "payload" : _payload
  }
}

function messageUserTypicalCommands(payload, reply){
 // bot.getProfile(payload.sender.id, (err, profile) => {
        let message = "Here's what you can do with Secret Files"
        //if (err) throw err

        reply({ 
          text: message,
          quick_replies: createMessageOptions()
        }, (err) => {//first argument should be 'text' or 'attachment' objects in payload.message
          if (err) throw err

          //console.log(`Echoed back to ${profile.first_name} ${profile.last_name}: ${text}`)
        })
      //})
}

function createMessageOptions(){
  return [
    createQuickTextReply(PostNew, PostNew),
    createQuickTextReply(ShowSecretFilesString, ShowSecretFilesString),
    createQuickTextReply(ShowPostsString, ShowPostsString)
  ]
}

function createButton(type, title){
  var button = {
    "type":type,
    "title":title,
    "payload": SubscribeString//+'-'+title//make more specific w db later
  }
  console.log('Creating button with payload value '+ button.payload)
  return button 
}

function extractSecretFileNameFromPayload(payload){
  var arr = payload.split('-')
  for(c = 0;c < arr.length;c++){
    if(arr[c] == 'DLSU'){//fetch dynamic value from db
      return arr[c]
    }
  }
  return ''
}

function isButtonOfPayload(buttonTitle){
  return payloadTitle.includes(buttonTitle)
}

function createElementForPayloadForAttachmentForMessage(title, subtitle, mainImageURL, exactImageURL, buttonsArray){
  return {
            "title":title,
            "item_url":mainImageURL,
            "image_url":exactImageURL,
            "subtitle":subtitle,
            "buttons": buttonsArray
          }
}

function createGenericPayloadForMessage(elementsArray){
  return {
    "template_type": "generic",
    "elements": elementsArray
  }
}

function createTemplateAttachmentForMessage(elementsArray){
  return {
          "type":"template",
          "payload": createGenericPayloadForMessage(elementsArray)
      }
}

function ShowSecretFilesSubscriptions(senderid, reply){
    console.log('ShowSecretFilesString() Activated')

      bot.getProfile(senderid, (err, profile) => {
        if (err) {
          console.log(err.message)
          throw err
        }

        //create and execute query (this is all async, makes it difficult to write a return function)
        var GETALLSECRETFILESQUERY = "SELECT * FROM GROUPITEM"
        var rowList = new List()
        var elementsList = new List()
        var queryRequest = new Request(GETALLSECRETFILESQUERY, function(err) {  
        if (err) {  
            console.log(err);}  
        });  

        queryRequest.on('row', function(columns) {
            var skip = false;
            //skip = isNullOrWhitespace(columns[5])
            //skip = isNullOrWhitespace(columns[6])
            if(skip == false) {
              console.log('skipping row? '+ skip)
              rowList.add(columns)
            }
        });  

        queryRequest.on('doneProc', function(rowCount, more) { 
          console.log(rowList.toArray().length + ' rows returned');  
          rowList.forEach(function(columns){
            elementsList.add(createElementForPayloadForAttachmentForMessage(
              columns[5],
              columns[6],
              "https://4.bp.blogspot.com", 
              "https://4.bp.blogspot.com/-BB8-tshB9fk/WA9IvvztmfI/AAAAAAAAcHU/hwMnPbAM4lUx8FtCTiSp7IpIes-S0RkLgCLcB/s640/dlsu-campus.jpg", 
              [
                createButton("postback", "Subscribe")
              ]
            ))
          })
          var elements = elementsList.toArray()
           /* [
              createElementForPayloadForAttachmentForMessage(
                  //SecretFileArr[0][5],
                  "Dummy Secret Files", 
                  //SecretFileArr[0][6],
                  "Dummy Secret File\'s New Home", 
                  "https://4.bp.blogspot.com", 
                  "https://4.bp.blogspot.com/-BB8-tshB9fk/WA9IvvztmfI/AAAAAAAAcHU/hwMnPbAM4lUx8FtCTiSp7IpIes-S0RkLgCLcB/s640/dlsu-campus.jpg", 
                  [
                    createButton("postback", "Subscribe")
                  ]
              )    
            ]*/

        //now show to user
          if(elements.length < 1){
            reply({ 
                text: 'There are no Secret Files yet! ',
                quick_replies: [
                  createQuickTextReply('Create', CreateNewSecretFileString)
                ]
            }, (err) => {
              if (err) {
                console.log(err.message)
                throw err
              }

              console.log(`Showing empty Secret Files subscription list to user `+ senderid)
            })
          }else {
            reply({ 
                attachment:createTemplateAttachmentForMessage(elements)
            }, (err) => {
              if (err) {
                console.log(err.message)
                throw err
              }

              console.log(`Showing Secret Files subscription list to user `+ senderid)
            })
          }

        });  

        connection.execSql(queryRequest); 
      })
}
/////////////////////////////////////////////////




////////////////////////////// Start server using express as middleware

let app = express()

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
  extended: true
}))

app.get('/', (req, res) => {
  return bot._verify(req, res)
})

app.post('/', (req, res) => {
  bot._handleMessage(req.body)
  res.end(JSON.stringify({status: 'ok'}))
})

var port = 
  process.env.PORT || 
  5000
http.createServer(app).listen(port)
console.log('Express NodeJS bot server running at port '+ port)

//for webhook w facebook messenger
//heroku server running at url https://murmuring-depths-99314.herokuapp.com/ and verify token 'token'

//////////////////////////////////

/**
 * db query pattern
 */
/* 
  var QUERY = ""
  var rowList = new List()
  var elementsList = new List()
  var queryRequest = new Request(QUERY, function(err) {  
  if (err) {  
      console.log(err)
    }  
  });  

  queryRequest.on('row', function(columns) {
      var skip = false;
      columns.forEach(function(column) {  
        if (column.value === null) {  
          skip = true
          console.log('empty value, skipping')
        }
        if(column.value == ''){
          skip = true
          console.log('empty value, skipping')
        }  
      });  
      if(skip == false) rowList.add(columns)
  });  

  queryRequest.on('doneProc', function(rowCount, more) { 
      console.log(rowCount + ' rows returned');  
      
  });  

  connection.execSql(queryRequest); 
*/