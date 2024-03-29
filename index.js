'use strict'
const http = require('http')

//for joining file paths
var path = require('path');

//lightweight wrapper for common fb messenger GET POST
const Bot = require('messenger-bot')

//for sql string escape characters in prepared statements
var SqlString = require('sqlstring');

//C# - like await/async functions
var async = require('asyncawait/async');
var await = require('asyncawait/await');

const request = require('request')
const express = require('express')
const bodyParser = require('body-parser')

//generic doubly linked list for more dynamic set operations
var List = require("collections/list");

//to access SQL Server on azure
var tedious = require('tedious')
//var Connection = tedious.Connection;
var ConnectionPool = require('tedious-connection-pool');
var Request = tedious.Request;  
var TYPES = tedious.TYPES; 

//init date object
const moment = require('moment');

//wit.ai setup stuff
const crypto = require('crypto');
const fetch = require('node-fetch');
var Wit = require('node-wit').Wit;
var log = require('node-wit').log;
const WIT_TOKEN = process.env.WIT_TOKEN || '6ILCGOHSHUJJ2BXAS3QHKWVSREOJG6FG';
//right now, only some functions rely on Wit.ai, so need a bool to deactivate my own recognition code when calling Wit.ai
var WitAiHasControl = false
//use this flag to mark when an action is done so wit.ai can reset the session to prevent context confusion
var contextDone = false

//object for replying to user
var globalReplyObj = null

//just some flags for keeping track of posts read by user in secret files
var postCounter = 0
var allPostsRead = false

//microsoft azure secret files application
var azureDBConnStr = 
"Driver={ODBC Driver 13 for SQL Server};Server=tcp:chrisdavetv.database.windows.net,1433;Database=chrisdavetvapps;Uid=chrisdavetv@chrisdavetv;Pwd={Chrisujt5287324747@@};Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"

//postback and message events string ids
var GETSTARTEDSTRING = "Get Started"
var PostNew = "Post"
var ShowPostsString = "Read Posts"
var ShowSecretFilesString = "Browse Secret Files"
var JoinString = "Join"
var HelpPersistentMenuItem = "Help"
var SubscribeStringPostback = "SubscribePostback"
var PostStringPostback = "PostPostback"
var HowDoesItWorkString = "How does it work?"
var TryItOutString = 'Try it out'
var CreateNewSecretFileString = "Create Secret File"
var postbackCommentOnPostString = 'Read This'
var postbackReadMorePostsString = 'Read More'
var postbackReadFromThisSecretFileString = 'Read From Here'
var payloadGroupProfilePicString = 'payloadGroupProfilePicString'
var postbackGroupProfilePicString = 'Use This'
var payloadReplyToPost = 'Reply to Secret'

const FB_PAGE_TOKEN = 'EAAX2onbWfdMBAEfamUMkl6uACF8tvWOtFMSFwzjcZBl2ovDPMUbV7BcsOMzj0OUzeoSPckZAHakSwCoxOjMFUcJpWdFYyFdviUmd0nNWhjwqdpYgQrNItKwZBACRldnUvUHMnwm20cBjypOPX18jn0S1MsajtZB59x1k2ikZAEQZDZD'

//initialize messenger-bot
let bot = new Bot({
  token: FB_PAGE_TOKEN,
  verify: 'token'
})

//initialize dynamic HTML generator
const pug = require('pug');
// Compile the source code
const compiledFunction = pug.compileFile('htmlPost.pug');

//////////////////////////////////////////from wit.ai messenger.js example
// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

//list of profile pics
var imageStrings = [
    'chicago.jpg',
    'monsters.jpg',
    'stanford.jpg'
  ]

const addSecretFilesStringToTitleIfNone = (title) => {
  const SECRETFILESSTRING = 'Secret Files'
  if(title.includes(SECRETFILESSTRING)){
    console.log('title already includes \'Secret Files\' ')
  }else{
    title = title+' '+SECRETFILESSTRING
  }
  return title
}

const firstEntityValue = (entities, entity) => {
  try{
    console.log('contents of entities is '+entities[entity])
    var eithernull = entities && entities[entity]
    var isArray = Array.isArray(entities[entity])
    var hasChars = entities[entity].length > 0
    var valueNotNull = entities[entity][0].value
    console.log('either null? '+eithernull)
    console.log('isArray? '+isArray)
    console.log('hasChars? '+hasChars)
    console.log('value not nul? '+valueNotNull)

    const val = eithernull && isArray && hasChars && valueNotNull
    if (!val) {
      console.log('firstEntityValue condition failed, returning null')
      return null;
    }
    return typeof val === 'object' ? val.value : val;
  }catch(err){
    console.log('wit.ai most likely didn\'t understand a message')
    //ReplyWithText('Sorry I didn\'t catch that. Please try again', reply)
  }
  return null
};

const fbMessage = (id, text) => {
  const body = JSON.stringify({
    recipient: { id },
    message: { text },
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

// Our bot actions
const actions = {
  send({sessionId}, {text}) {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      // We return a promise to let our bot know when we're done sending
      return fbMessage(recipientId, text)
      .then(() => null)
      .catch((err) => {
        console.error(
          'Oops! An error occurred while forwarding the response to',
          recipientId,
          ':',
          err.stack || err
        );
      });
    } else {
      console.error('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      return Promise.resolve()
    }
  },// You should implement your custom actions here
  //before we get here, user has to send a photo (via gallery or webview), catch that photo in message event, 
  //then extract link and send to wit.ai, which will call storeImageURL
  storeImageURL({context, entities}){
    return new Promise(function(resolve, reject) {
      context.secretFileImageURL = firstEntityValue(entities, 'url')
      if (context.secretFileImageURL) {
        delete context.failedSecretFileImageURL;
      } else {
        context.failedSecretFileImageURL = true;
        delete context.secretFileImageURL;
      }
      return resolve(context)
    })
  },
  storeSecretFileDesc({context, entities}){
    return new Promise(function(resolve, reject) {
      context.descriptionText =  firstEntityValue(entities, 'description')
      if (context.descriptionText) {
        delete context.failedSecretFileDescription;
      } else {
        context.failedSecretFileDescription = true;
        delete context.descriptionText;
      }
      return resolve(context)
    })
  },
  storeSecretFileTitle({context, entities}){
    return new Promise(function(resolve, reject) {
      //add secretFileName (entity) value to context so createNewSecretFile method can access it
      var title = firstEntityValue(entities, 'secretFileName')
      context.secretFileTitleText =  addSecretFilesStringToTitleIfNone(title)
      if (context.secretFileTitleText) {
        delete context.failedSecretFileTitle;
      } else {
        context.failedSecretFileTitle = true;
        delete context.secretFileTitleText;
      }
      return resolve(context)
    })
  },
  createNewSecretFile({context}) {
    var descText = 'Description recognition failed'
    var urlText = 'Image URL recognition failed'
    return new Promise(function(resolve, reject) {
      if(context.secretFileTitleText){
        if(context.descriptionText){
            descText = context.descriptionText
        }
        if(context.secretFileImageURL){
          urlText = context.secretFileImageURL
        }
        console.log('secretFileText is '+context.secretFileTitleText+' desc is '+descText)
        CreateNewSecretFileRecord(context.secretFileTitleText, descText, urlText)
      }else{
        console.log('The Secret File title is null, please try again')
      }
      
      console.log('done with wit.ai call, returning text recognition to local functions')
      endWitAISession_HandleAllMessagesLocally()

      

      //wrap up wit.ai session
      context.createSecretFileDone = true
      return resolve(context);
    });
  },
};

// Setting up our wit.ai bot
const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});

//wit.ai helper functions
function startWitAISession_ForwardAllMessages(senderid, messageToProcess){
  WitAiHasControl = true
  SendMessageToWitAI(senderid, messageToProcess)
}
function endWitAISession_HandleAllMessagesLocally(){
  WitAiHasControl = false
}
function SendMessageToWitAI(senderid, messageToProcess){
  //WitAiHasControl = true
  const sessionId = findOrCreateSession(senderid);
  wit.runActions(
    sessionId, // the user's current session
    messageToProcess, // the user's message
    sessions[sessionId].context // the user's current session state
  ).then((context) => {
    

    // Based on the session state, you might want to reset the session.
    // This depends heavily on the business logic of your bot.
    // Example:
    // if (context['done']) {
    //   delete sessions[sessionId];
    // }

    // Updating the user's current session state
    if(WitAiHasControl == true){
      sessions[sessionId].context = context;
      // Our bot did everything it has to do.
      // Now it's waiting for further messages to proceed.
      console.log('Waiting for next user messages');
    }else{
      delete sessions[sessionId]
      console.log('finished session. Any new wit.ai calls will start a new session free of context');
    }
  })
  .catch((err) => {
    console.error('Oops! Got an error from Wit: ', err.stack || err);
  })

  
}

///////////////////////////////////////////

//used to separate values in db fields
var VALUESEPARATOR = ';'

var pendingPostText = ''
var localTestMode = false
var serverString = ''
var staticFileURL = ''

if(localTestMode == true){
  serverString = 'chrisdavetv.database.windows.net'
  staticFileURL = "https://1b509bb4.ngrok.io"
}else{
  serverString = '127.0.0.1'
  staticFileURL = "https://murmuring-depths-99314.herokuapp.com/"
}
 
// When you connect to Azure SQL Server, you need these next options.  
var connectionConfig = {  
    userName: 'chrisdavetv@chrisdavetv',  
    password: 'Chrisujt5287324747@@',  
    server: serverString,//'127.0.0.1',
    options: {
      encrypt: true, 
      database: 'chrisdavetvapps',
      rowCollectionOnRequestCompletion: true,
      rowCollectionOnDone: true
    }  
}; 
var poolConfig = {
  min: 1,
  max: 2,
  log: true
};
//create the pool
var pool = new ConnectionPool(poolConfig, connectionConfig);
pool.on('error', function(err){
  if(err) console.log('Failed to connect to Azure SQL Server:', err.message)
  else console.log("Connected to Azure SQL Server "+connectionConfig.server+', DB '+connectionConfig.options.database);  
})


//connection will be refused by Azure SQL Server unless you add a firewall exception for this IP address
/*var connection = new Connection(connectionConfig);  
connection.on('connect', function(err) {  
  // If no error, then good to proceed.  
  if(err) console.log('Failed to connect to Azure SQL Server:', err.message)
  else console.log("Connected to Azure SQL Server "+connectionConfig.server+', DB '+connectionConfig.options.database);  
}); */

///////////////////////////////// SQL helper functions
var broadcastToSecretFilesSubscriptions = async (function(message, secretFileLabel, title){
  var rowList = new List()
  var subscriberArr = []

  //fetch subscriber list for secret file 
  pool.acquire(function(err, connection){
    if (err) {
        console.error(err);
        return;
    }
    
    try{
      var selectRequest = createRequest('SELECT username FROM SUBSCRIPTIONS WHERE subscription=@secretfilelabel')
      
      //insert values into those marked w '@'
      selectRequest.addParameter('secretfilelabel', TYPES.NVarChar, secretFileLabel)

      selectRequest.on('row', function(cols){//not firing
        console.log('row fetched: '+cols[0].value)
        rowList.add(cols[0].value)
      })
      selectRequest.on('requestCompleted', function(){
        //when query is done executing
        subscriberArr = rowList.toArray()//some value
        console.log('request completed: '+subscriberArr.length)

        //send message to all subscribers of secretFileLabel
        for(var c = 0;c < subscriberArr.length;c++){
          console.log('sending message to '+ subscriberArr[c])
          sendMessageQuickReplyToUser(subscriberArr[c], 
            formatMessageForBroadcast(message, title))
        }

        //release the connection back to the pool when finished
        connection.release();
      })

      connection.execSql(selectRequest)
    } catch(err){
      console.log("getSubscribedUsersForSecretFileAsArrayfunction error: "+err.message)
    }

  })
})

function createRequest(queryString){
  console.log('creating Request')
  return new Request(
        queryString, 
      function(err) {  
        if (err) {  
          console.log(err);
          throw err
        } 
      }
  ) 
}

/*var testAsync = async (function(){
  console.log('in broadcastToSecretFilesSubscriptions')
  var secretFileLabel = 'DLSU Secret Files'
  var subscribers = await (getSubscribedUsersForSecretFileAsArrayAsync(secretFileLabel))
  for(var c = 0;c < subscribers.length;c++){
    console.log('SUBSCRIBER +'+c+' IN '+secretFileLabel+': '+subscribers[c].value)
  }
  console.log('done fetching subscriber list')
})

function getSubscribedUsersForSecretFileAsArrayAsync(secretFileLabel){
  console.log('in getSubscribedUsersForSecretFileAsArrayfunction')
  var result = null
  var rowList = new List()

  pool.acquire(function(err, connection){
    if (err) {
        console.error(err);
        return;
    }
    
    try{
      //ddnt use addParameter func to avoid variable name confusion(@secretfilelabel vs @secretfilelabel%)
      var Request = createRequest('SELECT username FROM ACCOUNTITEM WHERE subscribedTo LIKE %\''+secretFileLabel+'\'%')
      //insert values into those marked w '@'
      //Request.addParameter('secretfilelabel', TYPES.NVarChar, secretFileLabel)

      Request.on('row', function(cols){
        console.log('row fetched: '+cols)
        rowList.add(cols)
      })
      Request.on('requestCompleted', function(){
        
        //when query is done executing
        result = rowList.toArray()//some value
        console.log('request completed: '+result.length)
        //release the connection back to the pool when finished
        connection.release();
      })

      connection.execSql(Request)
    } catch(err){
      console.log("getSubscribedUsersForSecretFileAsArrayfunction error: "+err.message)
    }

  })

  //don't return anything until sql parallel transaction finishes
  while(result === null){
    //setTimeout(function(){
      //console.log('waiting for subscriber list')
    //}, 50)
  }
  console.log('returning subscribers')
  return result
}*/

function SaveSecretFileProfilePic(imageStringAndSecretFileLabel){//call after user chooses profile pic
  var arr = imageStringAndSecretFileLabel.split(VALUESEPARATOR)
  var imageString = staticFileURL + '/' + 'images/' + arr[0]
  var secretFileLabel = arr[1]

  console.log('saving '+imageString+' image to secretfile '+secretFileLabel)
  //save profile pic to secret file record
  pool.acquire(function(err, connection){
    if (err) {
        console.error(err);
        return;
    }
    
    try{
      var saveRequest = new Request(
        'UPDATE GROUPITEM SET groupImage=@image WHERE groupName=@secretfiletitle', 
      function(err) {  
        if (err) {  
          console.log(err);
        }  

        //release the connection back to the pool when finished
        connection.release();
      });  

      //insert values into those marked w '@'
      saveRequest.addParameter('image', TYPES.NVarChar, imageString)
      saveRequest.addParameter('secretfiletitle', TYPES.NVarChar, secretFileLabel)

      connection.execSql(saveRequest);
    } catch(err){
      console.log("SaveSecretFileProfilePic error: "+err.message)
    }

  })
}

function Login(userid){
    console.log('CreateAccountRecordOrLogin: logging in')
    var rowList = new List()

    pool.acquire(function(err, connection){
        if (err) {
            console.error(err);
            return;
        }

      //check if user already logged in before
      try{
        var selectRequest = new Request("SELECT * FROM ACCOUNTITEM WHERE username = @username", function(err){
          if (err) {  
            console.log(err);
          }

          if(rowList.toArray().length > 0){
            //then userid already exists in db
            console.log('userid '+userid+' already exists in db')
          }else{
            CreateAccountRecord(userid)
          }

          //release the connection back to the pool when finished
          connection.release();
        })
        selectRequest.addParameter('username', TYPES.NVarChar, userid)

        selectRequest.on('row', function(columns){
          rowList.add(columns)
        })

        connection.execSql(selectRequest)
      }catch(err){
        console.log('Login error: '+err.message)
      }
    })
}

function IsDoneReadingAllPostsInSecretFile(secretFileName){
  if(postCounter == 0 && allPostsRead == true){
    allPostsRead = false
    return true
  }
  return false
}

function FetchPostsInSecretFile(secretFileName, reply){
  console.log('fetching posts for '+secretFileName)
  var postsList = new List()

  pool.acquire(function(err, connection){
    if (err) {
      console.error(err);
      return;
    }

    var getPostsRequest = new Request(
    'SELECT * FROM POSTITEM WHERE groupID=@groupname ORDER BY createdAt DESC', 
    function(err){
      if (err) {  
        console.log(err);
      } 
    })
    getPostsRequest.addParameter('groupname', TYPES.NVarChar, secretFileName)
    getPostsRequest.on('requestCompleted', function(){
      //when query is done executing

      ShowPostsToUser(postsList, reply)

      //release the connection back to the pool when finished
      connection.release();
    })
    getPostsRequest.on('row', function(columns){
      postsList.add(columns)
    })

    connection.execSql(getPostsRequest)
  })

}

function CreateAccountRecord(userid){
  pool.acquire(function(err, connection){
      try{
        var insertRequest = new Request(
          'INSERT INTO ACCOUNTITEM (username, password) VALUES (@user, @pass)', 
        function(err) {  
          if (err) {  
            console.log(err);
          }  

          //release the connection back to the pool when finished
          connection.release();
        });  

        insertRequest.on('doneProc', function(rowCount, more){
          console.log('CreateAccountRecord: created account with username '+userid)
        })

        //insert values into those marked w '@'
        insertRequest.addParameter('user', TYPES.NVarChar, userid);
        insertRequest.addParameter('pass', TYPES.NVarChar, '');

        connection.execSql(insertRequest);
      } catch(err){
        console.log("CreateAccountRecord error: "+err.message)
      }
  })
}

//#DLSUSecretFiles1234 - number should be counter field in db

function SubscribeToSecretFile(reply, secretfile, userid){
  console.log('subscribing to secretfile: '+secretfile)
  //var userSubscriptionList = ''//get value of current user subscriptions

  pool.acquire(function(err, connection){
    if (err) {
        console.error(err);
        return;
    }

    var accountRowList = new List()
    var selectRequest = new Request("SELECT * FROM ACCOUNTITEM WHERE username=@userid", function(err){//update GroupItem subscribers field too
      if (err) {  
        console.log(err);
      }  

      var arr = accountRowList.toArray()
      if(arr.length > 0){
        pool.acquire(function(err, connection){
            //go ahead and update value
            var rowList = new List()
            var updateRequest = new Request(
                "INSERT INTO SUBSCRIPTIONS (username, subscription) VALUES (@userid, @subscriptions)"//WHERE @subscriptions NOT IN ()
                , function(err) {  
              if (err) {  
                console.log(err);
              }  

              //if subscribed succesfully
              var responseMessage = 'Whenever someone posts on '+secretfile+
                ', it will appear here from now on! Here\'s what we can do next:'
              ReplyWithQuickReply(responseMessage, [
                    createQuickTextReply(PostNew, PostNew),
                    createQuickTextReply(ShowPostsString, ShowPostsString)
                  ], reply)

              //release the connection back to the pool when finished
              connection.release();
            });  

            updateRequest.addParameter('userid', TYPES.NVarChar, userid)
            updateRequest.addParameter('subscriptions', TYPES.NVarChar, secretfile)//userSubscriptionList)

            updateRequest.on('row', function(columns) {
                rowList.add(columns)
            });

            connection.execSql(updateRequest)
        })
      }else{
        console.log('SubscribeToSecretFile: no account found. creating one then subscribing again')
        
      }

      //release the connection back to the pool when finished
      connection.release();
    })

    selectRequest.addParameter('userid', TYPES.NVarChar, userid)
    selectRequest.on('row', function(columns){
      accountRowList.add(columns)
    })
    connection.execSql(selectRequest)
    
  }) 
}

function ReplyUnderConstruction(reply){
  reply({
    text: "Oops! Sorry this feature is still under construction"
  }, (err, info) => {
    if(err){
      console.log(err.message)
      throw err
    }
  })
}

function SomethingWentWrong(actionString, reply){
  reply({
    text:"Oops! Something went wrong while "+actionString+". Please try again"
    }, (err, info) => {
      if(err){
        console.log(err.message)
        throw err
      }
  })
}
function TellUserSuccess(message, reply){
  reply({
    text: message
    }, (err, info) => {
      if(err){
        console.log(err.message)
        throw err
      }
  })
}

function CreateNewPostRecord(postText, reply, secretfileid){
  console.log('Creating a new post')

    pool.acquire(function(err, connection){
        if (err) {
            console.error(err);
            return;
        }

        var rowList = new List()
        var totalSecretFileCount = 0
        var selectRequest = new Request(
          'SELECT * FROM POSTITEM WHERE groupID=@secretfileid',
        function(err) {  
          if (err) {  
            console.log(err);
          }  

          totalSecretFileCount = (rowList.toArray()).length//used for number in #DLSU Secret Files <number here>
          var title = removeSpaces(secretfileid)+totalSecretFileCount
          pool.acquire(function(err, connection){
              var queryRequest = new Request(
                'INSERT INTO POSTITEM (postImage, userId, groupID, reactionCount, body, title) VALUES (@image, @userid, @groupid, @reactionCount, @bodyText, @titleText)', 
              function(err) {  
                if (err) {  
                  console.log(err);
                  SomethingWentWrong("posting", reply)
                } else{
                  TellUserSuccess("Posted to "+secretfileid+"!", reply)
                  //pendingPostText = ''

                  //broadcast post to all subcribers of this secret file
                  broadcastToSecretFilesSubscriptions(postText, secretfileid, title)
                }

                //release the connection back to the pool when finished
                connection.release();
              });  
              queryRequest.addParameter('image', TYPES.NVarChar, '');
              queryRequest.addParameter('userid', TYPES.NVarChar, '');
              queryRequest.addParameter('groupid', TYPES.NVarChar, secretfileid);
              queryRequest.addParameter('reactionCount', TYPES.NVarChar, '');
              queryRequest.addParameter('bodyText', TYPES.NVarChar, postText);
              queryRequest.addParameter('titleText', TYPES.NVarChar, /*'#'+*/ title);
              connection.execSql(queryRequest); 
          })

          //release the connection back to the pool when finished
          connection.release();
        });  
        selectRequest.addParameter('secretfileid', TYPES.NVarChar, secretfileid)
        selectRequest.on('row', function(columns){
          rowList.add(columns)
        })
        connection.execSql(selectRequest)
        
    })

    console.log('CreateNewPostRecord done')
    return true
}

function CreateNewSecretFileRecord(title, desc, imageurl) {  
    try{
      console.log('Creating a new Secret File: '+title+' with description: '+desc)

      pool.acquire(function(err, connection){
        var queryRequest = new Request(
          'INSERT INTO GROUPITEM (groupName, groupDesc, groupImage, adminuserId) VALUES (@title, @desc, @image, @adminuserId)', 
        function(err) {  
          if (err) {  
            console.log(err);
          }  

          //choose profile pic here
          console.log('CreateNewSecretFileRecord: globalReplyObj is null? '+ globalReplyObj == null)
          ShowGroupProfilePics(title, globalReplyObj)

          //release the connection back to the pool when finished
          connection.release();
        });  

        //insert values into those marked w '@'
        queryRequest.addParameter('title', TYPES.NVarChar, title);
        queryRequest.addParameter('desc', TYPES.NVarChar, desc);
        queryRequest.addParameter('image', TYPES.NVarChar, imageurl);
        queryRequest.addParameter('adminuserId', TYPES.NVarChar, '');

        connection.execSql(queryRequest); 
      }) 

      console.log('CreateNewSecretFileRecord executed')
    }catch(err){
      console.log('CreateNewSecretFileRecord error: '+err.message)
      return err
    }
    return true
}  

function EditSecretFileRecord(title, desc, imageurl){}
function DeleteSecretFileRecord(){}

/////////////////////////////////

// messenger bot initial ui and menu
createPersistentMenu()
createGetStartedButton()

//////////////////////////////// Messaging event handlers

bot.on('error', (err) => {
  console.log(err.message)
})

bot.on('message', (callbackObject, reply) => {//fb servers are being screwy i think
  console.log('message received')
  console.log('received message '+callbackObject.message.text+ ' from user '+callbackObject.sender.id)

  globalReplyObj = reply

  if(WitAiHasControl == false){
    if(callbackObject.message.quick_reply){
      //handles quick_replies
      handleMessages(callbackObject.message.quick_reply.payload, callbackObject, reply)
    }
    else if(handleMessages(callbackObject.message.text, callbackObject, reply)){//handles manually typed commands
      console.log('------------------------ received manually typed command --------------------------------------')
    }
    else{
      console.log('------------------------ received confusing message ---------------------------')
      messageUserTypicalCommands(reply)//handles text otherwise not understood by bot
    }
  }else {
    console.log('in Wit.ai mode')
    var imageURL = isImageAttachment(callbackObject)
    console.log('is image? '+imageURL)

    if(imageURL){
      SendMessageToWitAI(callbackObject.sender.id, imageURL)
    }else{//its a text message
      SendMessageToWitAI(callbackObject.sender.id, callbackObject.message.text)
    }
  }
  
})

bot.on('postback', (postbackContainer, reply, actions) => {
  globalReplyObj = reply

  var _payload = postbackContainer.postback.payload
  console.log('postback event received from user '+ postbackContainer.sender.id)
  console.log('payload: '+ _payload)
  console.log('reply: '+ reply)
  console.log('actions '+ actions)

  //check if payload is from Get Started button in greeting screen
  if(_payload == GETSTARTEDSTRING){
    Login(postbackContainer.sender.id)
    ShowIntroMessage(reply)
  }

  //check if payload is a susbcribe action from ShowSecretFilesSubscriptions
  else if(_payload.includes(SubscribeStringPostback)){
    //extract secretfile name from postbackContainer
    SubscribeToSecretFile(reply, extractDataFromPayload(_payload, 1), postbackContainer.sender.id)
  }else if(_payload.includes(PostStringPostback)){
    console.log('continue posting condition satisfied. postText is '+pendingPostText)
    ContinuePostingInNewSecretFile(pendingPostText, reply, extractDataFromPayload(_payload, 1))
    pendingPostText = ''
  }else if(_payload.includes(postbackCommentOnPostString)){
    //view full post
    //ExpandPostInWebView()
  /*}else if(_payload.includes(postbackReadMorePostsString)){
    //load another post
    FetchPostsInSecretFile(extractDataFromPayload(_payload, 2), reply)*/
  }else if(_payload.includes(postbackReadFromThisSecretFileString)){
    FetchPostsInSecretFile(extractDataFromPayload(_payload, 1), reply)
  }else if(IsImageProfilePic(extractDataFromPayload(_payload, 0))){
    SaveSecretFileProfilePic(_payload)
  }

  //actions from hamburger icon on left of message field
  else handlePersistentMenuActions(_payload, postbackContainer.sender.id, reply)
})

///////////////////////////////

/////////////////////////////// Helper functions
function formatMessageForBroadcast(message, secretfilehashtag){
  return '#' + secretfilehashtag + '\n\n' + message
}

function sendMessageToUser(recipientID, message){
  try{
    bot.sendMessage(recipientID, {
      "text":message
      }, function(err, info){
        if(err){
          console.log(err)
          throw err
        }
    })
  }catch(err){
    if(err){
      console.log(err)
      throw err
    }
  }
}

function sendMessageQuickReplyToUser(recipientID, message){
  try{
    bot.sendMessage(recipientID, {
      "text":message,
      "quick_replies": [
          createQuickTextReply('Reply', payloadReplyToPost)
          //like, dislike, react, etc?
        ]
      }, function(err, info){
        if(err){
          console.log(err)
          throw err
        }
    })
  }catch(err){
    if(err){
      console.log(err)
      throw err
    }
  }
}

function IsImageProfilePic(imageString){
  console.log('checking if profile pic')
  for(var c = 0;c < imageStrings.length;c++){
    if(imageStrings[c] === imageString){
      console.log('found profile pic')
      return true
    }
  }
  console.log('no profile pic found')
  return false
}

function ShowGroupProfilePics(secretfileString, reply){//call this to show profile pic options
  var elementList = new List()
  //loop through db stored images
  
  for(var c = 0;c < imageStrings.length;c++){
    elementList.add(
      createElementForPayloadForAttachmentForMessage(
        imageStrings[c],//generate labels for imageStrings array
        '',
        'https://www.google.com',//staticFileURL,
        staticFileURL + '/' + 'images/' + imageStrings[c],
        [
          createButton("postback", postbackGroupProfilePicString, 
                                    imageStrings[c]+VALUESEPARATOR+secretfileString)
        ]
      )
    )
  }
  ShowAttachmentToUser("Choose a profile pic for your Secret File", elementList.toArray(), reply)
}

function CreatePostHTML(filename, postTitle, bodytitle, bodytext, alias, date){
  //render html text string with pug
  var html = compiledFunction({
    secretfilenumber: postTitle,
    bodytitle: bodytitle,
    bodytext: bodytext,
    alias: alias,
    date: date
  })

  //save string to html file
  var fs = require('fs');
  try{
    fs.writeFileSync("public/"+filename, html)
  }catch(err){
    console.log(err.message)
    throw err
  }

}

//Add to messenger-bot on git?
function uploadImage(recipient, filepath, filetype, callbackFunc){//integrate with CreateNewSecretFileRecord method
  if (!callbackFunc) callbackFunc = Function.prototype
  //if(isValidImageType(filetype)){}
  request({
    method: '',//post or get?
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {
      access_token: FB_PAGE_TOKEN
    },
    json: {
      recipient: { id: recipient },
      message: {attachment:{type:"image", payload:{}}},
      filedata: filepath+';type=image/'+filetype
    }
  }, (err, res, body) => {
    if (err) return callbackFunc(err)
    if (body.error) return callbackFunc(body.error)

    callbackFunc(null, body)
  })
}
function isValidImageType(filetype){
  if(filetype == 'png' || filetype == 'jpg' || filetype == 'gif')
    return true
  return false
}

function isImageAttachment(callbackMessageObject){
  console.log('checking if message is image')
  //var isImage = isNullOrWhitespace(callbackMessageObject.message.attachments.payload.url)
  if(callbackMessageObject.message.attachments && 
      callbackMessageObject.message.attachments.payload &&
      callbackMessageObject.message.attachments.payload.url){
    return callbackMessageObject.message.attachments.payload.url
  }else return null
}

function ShowPostsToUser(postList, reply){
  var elementsList = new List()
  var postsArr = postList.toArray()
  if(postsArr.length > 0){
    postsArr.forEach(function(columns){
      if(columns){
        //create html files for each post
        var filename = columns[10].value+".html"
        var url = staticFileURL
                  +
                  "/"+filename
        var title = columns[10].value
        var body = columns[9].value
        var secretfile = columns[7].value
        var date = moment(columns[1].value).fromNow()
        CreatePostHTML(filename, secretfile, '#'+title, body, 'CCS 109', date)

        elementsList.add(
          createElementForPayloadForAttachmentForMessage(
            title,
            body,
            '', '',
            //"https://4.bp.blogspot.com", 
            //"https://4.bp.blogspot.com/-BB8-tshB9fk/WA9IvvztmfI/AAAAAAAAcHU/hwMnPbAM4lUx8FtCTiSp7IpIes-S0RkLgCLcB/s640/dlsu-campus.jpg", 
            [
              createUrlButton("Read", url)//button title doesnt matter, cause it doesnt trigger an event, but goes straight to a webview
            ]
          )
        )
      }else{
        ReplyWithQuickReply('No more posts left to read', createMessageOptions(), reply)
      }
    })
  }else{
    ReplyWithQuickReply('No more posts left to read', createMessageOptions(), reply)
  } 

  ShowAttachmentToUser(null, elementsList.toArray(), reply)
}
function ReplyWithText(message, reply){
  if(message === null){
  }else{
    reply({text:message}, (err, info)=>{
      if(err){
        console.log(err)
        throw err
      }
    })
  }
}
function ReplyWithQuickReply(message, quickreplies, reply){
  if(message && quickreplies && quickreplies.length > 0){
    console.log('about to send quick replies')
    reply({
      text: message, 
      quick_replies: quickreplies}, (err, info)=>{
      if(err){
        console.log(err)
        throw err
      }
    })
  }
}
function ReplyWithAttachment(attachmentObject, reply){
  if(attachmentObject === null){
  }else{
    reply({attachment:attachmentObject}, (err, info)=>{
      if(err){
        console.log(err)
        throw err
      }
    })
  }
}
/*function ShowAttachmentToUser(elements){
  reply({ 
      attachment:createTemplateAttachmentForMessage(elements)
  }, (err) => {
    if (err) {
      console.log(err.message)
      throw err
    }

    console.log(`Showing attachment to user `+ senderid)
  })
}*/

//data is at index 1 and onwards. index 0 contains the postback type string
function extractDataFromPayload(payload, columnNum){
  var arr = payload.split(VALUESEPARATOR)
  console.log('extracted secret file '+arr[1]+' from payload')
  return arr[columnNum]
}

function isNullOrWhitespace(input) {
    if (typeof input === 'undefined' || input == null) return true;

    return input.replace(/ /g, '').length < 1;
}

function removeSpaces(input){
  return input.replace(/ /g, '')
}

function handleMessages(message, callbackObject, reply){
    var postMessage = IsPost(message)
    console.log('is a post? '+ postMessage)

    //add image upload condition
    try{
      if(message == ShowSecretFilesString){
        console.log("ShowSecretFilesString payload condition satisfied in message event")
        ShowSecretFilesSubscriptions(callbackObject.sender.id, reply, SubscribeStringPostback)
        return true
      }else if(message == JoinString){// || operator seems to trigger a satisfied condition on the first if statement here
        console.log("JoinString payload condition satisfied in message event")
        ShowSecretFilesSubscriptions(callbackObject.sender.id, reply, SubscribeStringPostback)
        return true
      }
      else if(message == PostNew){
      //create new secret file via options:camera, text
        //PostNewinSecretFile(reply, message)
        ExplainHowToPost(reply)
        return true
      }
      else if(message == ShowPostsString){
        //show all posts from currently subscribed Secret Files
        ShowAllSubscribedPosts(callbackObject, reply, callbackObject.sender.id)
        //ShowSubscribedPosts(callbackObject, reply, callbackObject.sender.id)
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
        console.log('entered CreateNewSecretFileString message condition')
        startWitAISession_ForwardAllMessages(callbackObject.sender.id, message)
        return true
      }else if(postMessage){
        console.log('received a post request')
        var postText = postMessage.replace('post', '')
        pendingPostText = postText
        PostNewinSecretFile(reply, callbackObject.sender.id)
        return true
      }else if(message == payloadReplyToPost){
        ReplyUnderConstruction(globalReplyObj)
        return true
      }/*else if(imageMessage){//move to WitAiHasControl true block
        console.log('received an image attachment with url '+imageMessage)
        //store image in Secret File
        return true
      }*/
    }catch(err){
      return err
    }

    return false
}

String.prototype.firstLetterToLowerCase = function(){
  return this.charAt(0).toLowerCase() + this.slice(1)
}
function IsPost(message){
  console.log('in IsPost')
  if(isNullOrWhitespace(message) == false){
    var firstpart = removeSpaces(message.substring(0, 9))
    console.log('firstpart is:'+firstpart)
    var stringWherePostShouldBe = firstpart.substring(0, 4)//first 4 characters in string
    console.log('stringWherePostShouldBe is:'+stringWherePostShouldBe)
    if(stringWherePostShouldBe.toLowerCase() == 'post'){
      for(var c = 0;c < 3;c++){
        if(isNullOrWhitespace(message.charAt(c))){
          message = message.slice(c+1)
          console.log('removed space at start of post: '+message)
        }
      }
      console.log('returning post '+message.firstLetterToLowerCase())
      return message.firstLetterToLowerCase()
    }
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

function ExplainHowToPost(reply){
  reply({
      text: "To post on Secret Files, start by typing 'Post' followed by what you wanna post. For example: 'Post Hey guys! So I wanted to share something... etc' "
      }, (err, info) => {
        if(err) {
          console.log(err.message)
          throw err
        }
    })
}

function handlePersistentMenuActions(_payload, senderid, reply){
  console.log('In handlePersistentMenuActions')
  //check if payload was sent by a persistent menu item
  if(_payload == HelpPersistentMenuItem){
    messageUserTypicalCommands(reply)
  }
  else if(_payload == PostNew){
    //PostNewinSecretFile(reply)
    ExplainHowToPost(reply)
  }
  else if(_payload == ShowPostsString){
    ShowAllSubscribedPosts(_payload, reply, senderid)
    //ShowSubscribedPosts(_payload, reply, senderid)
  }
  else if(_payload == ShowSecretFilesString){
   ShowSecretFilesSubscriptions(senderid, reply, SubscribeStringPostback)
  }else if(_payload == CreateNewSecretFileString){
    console.log('entered CreateNewSecretFileString postback condition')
    startWitAISession_ForwardAllMessages(senderid, _payload)
  }
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
    },
    {
      "type":"postback",
      "title": CreateNewSecretFileString,
      "payload": CreateNewSecretFileString
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

function ShowSubscribedPosts(payload, reply, userid){
  console.log('ShowSubscribedPosts started')
  var elementsList = new List()

  //ask user which subscribed secret file to read from
  var subList = new List()
  pool.acquire(function(err, connection){
    if (err) {
        console.error(err);
        return;
    }

    var selectRequest = 
      createRequest('SELECT GroupItem.groupName, GroupItem.groupDesc, GroupItem.groupImage FROM GroupItem INNER JOIN SUBSCRIPTIONS ON GROUPITEM.groupName=SUBSCRIPTIONS.subscription')// WHERE Subscriptions.username=@userid')
    //selectRequest.addParameter('userid', TYPES.NVarChar, userid)

    selectRequest.on('row', function(columns){
      console.log('subscription fetched: '+ columns[0].value + ', ' + columns[1].value + ', ' + columns[2].value)

      elementsList.add(createElementForPayloadForAttachmentForMessage(
        columns[0].value,
        columns[1].value, 
        'https://www.google.com', 
        columns[2].value,
        [
          createButton("postback", postbackReadFromThisSecretFileString, 
            postbackReadFromThisSecretFileString + VALUESEPARATOR + columns[0].value)
        ]
      ))
    })

    selectRequest.on('requestCompleted', function(){
      console.log('done fetching subscriptions')

      /*var elements = elementsList.toArray()
      if(elements.length > 0) {
        ShowAttachmentToUser('Which Secret File do you want to read?', elements, reply)
      }else{
        ReplyWithText('You\'re not subscribed to any Secret Files yet', reply)
        ShowSecretFilesSubscriptions(userid, reply, SubscribeStringPostback)
      }*/
      
    })

  })
}

function ShowAllSubscribedPosts(payload, reply, userid){
  console.log('In ShowAllSubscribedPosts, userid: '+userid)
  var secretfilename = ''
  var elementsList = new List()
  var afterLoopThreadCounter = 0

  //ask user which subscribed secret file to read from
  var subList = new List()
  pool.acquire(function(err, connection){
    if (err) {
        console.error(err);
        return;
    }

    var selectRequest = createRequest('SELECT subscription FROM SUBSCRIPTIONS WHERE username=@userid')
    selectRequest.addParameter('userid', TYPES.NVarChar, userid)
    selectRequest.on('row', function(columns){
      console.log('subscription fetched: '+ columns[0].value)
      subList.add(columns[0].value)
    })
    selectRequest.on('requestCompleted', function(){
      console.log('done fetching subscriptions')
      //done executing
      var subArr = subList.toArray()
      if(subArr.length == 0){
        ReplyWithText('You\'re not subscribed to any Secret Files yet', reply)
        ShowSecretFilesSubscriptions(userid, reply, SubscribeStringPostback)
      }
      for(var c = 0;c < subArr.length;c++){
        console.log('SUBSCRIPTION ITERATION OUTSIDE secretFileRequest: '+c)
        var secretfilename = subArr[c]
        try{
          pool.acquire(function(err, connection){
            if (err) {
                console.error(err)
                return;
            }

            console.log('fetching groupitem data of '+ secretfilename)
            var secretFileRequest = createRequest('SELECT * FROM GROUPITEM WHERE groupName=@secretfilename')
            secretFileRequest.addParameter('secretfilename', TYPES.NVarChar, secretfilename) 

            secretFileRequest.on('row', function(cols){
                elementsList.add(createElementForPayloadForAttachmentForMessage(
                  (cols[5]).value,
                  (cols[6]).value, 
                  'https://www.google.com', 
                  cols[7].value,
                  [
                    createButton("postback", postbackReadFromThisSecretFileString, 
                      postbackReadFromThisSecretFileString+VALUESEPARATOR+cols[5].value)
                  ]
                ))
            })
            
            secretFileRequest.on('requestCompleted', function(){
                var elements = elementsList.toArray()
                console.log('SUBSCRIPTION ITERATION: '+c)
                
                //ask user which secret file to read from
                if(afterLoopThreadCounter == subArr.length - 1){
                  if(elements.length > 0) {
                    ShowAttachmentToUser('Which Secret File do you want to read?', elements, reply)
                  }
                  afterLoopThreadCounter = 0;
               }

                //release the connection back to the pool when finished
                connection.release();
                afterLoopThreadCounter++
            })

            connection.execSql(secretFileRequest)
          })
        }catch(err){
          if(err){
            console.log(err)
          }
        }
      }

      //release the connection back to the pool when finished
      connection.release();
      subList.clear()
    })

    connection.execSql(selectRequest)
  })
}

function ShowAttachmentToUser(message, elements, reply){
  console.log('ShowAttachmentToUser checking if params are not null')
  console.log('length: '+elements.length)
  if(elements && elements.length > 0){
    if(message) ReplyWithText(message, reply)
    ReplyWithAttachment(createTemplateAttachmentForMessage(elements), reply)
  }else{
    console.log('array has no elements')
  }
}

function PostNewinSecretFile(reply, senderid){
  //pick a secretfile to post in
  reply({
    text:'Which Secret File do you want to post in?'
  }, (err, info) => {
    if(err){
      console.log(err.message)
      throw err
    }
  })
  ShowSecretFilesSubscriptions(senderid, reply, PostStringPostback)
}
function ContinuePostingInNewSecretFile(message, reply, secretfileid){
  console.log('In ContinuePostingInNewSecretFile')
  if(secretfileid){
    CreateNewPostRecord(message, reply, secretfileid)
    
  }else{
    console.log('something wrong with secretfileid string:'+secretfileid)
  }
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

/*function CreateNewSecretFile(payload, reply){
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

  CreateNewSecretFileRecord('Ateneo Secret Files', 'Description here', '')
}*/

function createQuickTextReply(_title, _payload){
  return {
    "content_type" : "text",
    "title" : _title,
    "payload" : _payload
  }
}

function messageUserTypicalCommands(reply){
    let message = "Here's what you can do with Secret Files"
    reply({ 
      text: message,
      quick_replies: createMessageOptions()
    }, (err) => {//first argument should be 'text' or 'attachment' objects in payload.message
      if (err) throw err
    })
}

function createMessageOptions(){
  return [
    createQuickTextReply(PostNew, PostNew),
    createQuickTextReply(ShowSecretFilesString, ShowSecretFilesString),
    createQuickTextReply(ShowPostsString, ShowPostsString)
  ]
}

function createUrlButton(title, url){
  var button = {
    "type":"web_url",
    "url": url,
    "title": title,
    "webview_height_ratio": "tall",
    //"messenger_extensions": true,  
    //"fallback_url": "https://petersfancyapparel.com/fallback"//url property not supported on messenger.com
  }
  
  console.log('Creating url button with title '+ button.title+' and url '+button.url)
  return button 
}

function createButton(type, title, postbackPayloadTypeString){
  var button = {
    "type":type,
    "title":title,
    "payload": postbackPayloadTypeString
  }
  console.log('Creating button with payload value '+ button.payload)
  return button 
}

/*function extractDataFromPayload(payload){
  var arr = payload.split('-')
  for(c = 0;c < arr.length;c++){
    if(arr[c] == 'DLSU'){//fetch dynamic value from db
      return arr[c]
    }
  }
  return ''
}*/

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

function ShowSecretFilesSubscriptions(senderid, reply, postbackPayloadTypeString){
    var buttonText = ''
    if(postbackPayloadTypeString.includes(SubscribeStringPostback)){
      buttonText = "Subscribe"
    }else{
      buttonText = "Post here"
    }

    pool.acquire(function(err, connection){
      bot.getProfile(senderid, (err, profile) => {
        if (err) {
          console.log(err.message)
          throw err
        }

        //create and execute query (this is all async, makes it difficult to write a return function)
        var GETALLSECRETFILESQUERY = "SELECT * FROM GROUPITEM"
        var rowList = new List()
        var elementsList = new List()
        var queryRequest = createRequest(GETALLSECRETFILESQUERY)

        queryRequest.on('row', function(columns) {
            var skip = false;
            skip = isNullOrWhitespace(columns[5].value)
            skip = isNullOrWhitespace(columns[6].value)
            
            console.log('groupName is '+columns[5].value+' and groupDesc is '+ columns[6].value)
            console.log('skipping row? '+ skip)
            if(skip == false) {
              rowList.add(columns)
            }
        });  

        queryRequest.on('requestCompleted', function() { 
          //"https://4.bp.blogspot.com/-BB8-tshB9fk/WA9IvvztmfI/AAAAAAAAcHU/hwMnPbAM4lUx8FtCTiSp7IpIes-S0RkLgCLcB/s640/dlsu-campus.jpg".split('.com'))[0] +'.com'
          
          console.log(rowList.toArray().length + ' rows returned');  
          rowList.forEach(function(columns){
            console.log('url to be saved: '+columns[7].value)
            elementsList.add(createElementForPayloadForAttachmentForMessage(
              columns[5].value,
              columns[6].value,
              'https://www.google.com',//(columns[7].value.split('.com'))[0] + '.com', 
              columns[7].value,
              [
                createButton("postback", buttonText, postbackPayloadTypeString+VALUESEPARATOR+columns[5].value)
              ]
            ))
          })
          var elements = elementsList.toArray()

          //now show to user
          if(elements.length < 1){
            reply({ 
                text: 'There are no Secret Files yet! ',
                quick_replies: [
                  createQuickTextReply(CreateNewSecretFileString, CreateNewSecretFileString)
                ]
            }, (err) => {
              if (err) {
                console.log(err.message)
                throw err
              }

              console.log(`Showing empty Secret Files subscription list to user `+ senderid)
            })
          }else {
            ShowAttachmentToUser(null, elements, reply)
          }

          //release the connection back to the pool when finished
          connection.release()
        });  

        connection.execSql(queryRequest); 
        
      })
    })
      
}
/////////////////////////////////////////////////

////////////////////////////// Start server using express as middleware
//working on local html loading in webview
let app = express()

app.use(express.static(path.join(__dirname, 'public'), { index: false}));
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
  extended: true
}))

//if the GET and POST events dont listen for /webhook (like listening for / instead), message received event doesn't trigger for some reason
app.get('/webhook', (req, res) => {
  return bot._verify(req, res)
})

app.post('/webhook', (req, res) => {
  bot._handleMessage(req.body)
  res.end(JSON.stringify({status: 'ok'}))
})

//port
var port = 
  process.env.PORT 
  || 5000

app.listen(port)
console.log('Express NodeJS bot server running at port '+ port)

//for webhook w facebook messenger
//heroku server running at url https://murmuring-depths-99314.herokuapp.com/ and verify token 'token'

//////////////////////////////////