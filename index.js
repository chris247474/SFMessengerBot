'use strict'
const http = require('http')

//for joining file paths
var path = require('path');

//port
var port = 
  process.env.PORT 
  || 5000

//lightweight wrapper for common fb messenger GET POST
const Bot = require('messenger-bot')

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

const FB_PAGE_TOKEN = 'EAAX2onbWfdMBAGsG7XKJIDWuuZBoPQVt0euv438fQsWrE1aRNJGxERWRR9n1QQN7upG6k3xrwwodgEdZBibLnQFGtDsA1wT8oTnSTJe5pNeL2kqquZCDM5UopTXYpoWsBfh8sO673Uz4vzV3osCVDSxJZBKvWZBfJXCUag9bRdwZDZD'

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
    var descText = ''
    return new Promise(function(resolve, reject) {
      if(context.secretFileTitleText){
        if(context.descriptionText){
            descText = context.descriptionText
        }else {
            descText = 'Description recognition failed'
        }
        console.log('secretFileText is '+context.secretFileTitleText+' desc is '+descText)
        CreateNewSecretFileRecord(context.secretFileTitleText, descText, '')
      }else{
        console.log('The Secret File title is null, please try again')
      }
      
      console.log('done with wit.ai call, returning text recognition to local functions')
      endWitAISession_HandleAllMessagesLocally()
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

if(localTestMode == true){
  serverString = 'chrisdavetv.database.windows.net'
}else{
  serverString = '127.0.0.1'
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
  min: 2,
  max: 4,
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
            console.log('userid ${userid} already exists in db')
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
    //reset flags
    //postCounter = 0
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

      /*console.log('about to show a post for reading, postCounter is '+postCounter)
      var postsArr = postsList.toArray()
      console.log('fetched '+postsArr.length+' posts')
      if(postsArr.length > 0){
        ShowPostsToUser([ postsArr[postCounter] ], reply)
        if(postCounter < postsArr.length){
          postCounter++
        }else{
          postCounter = 0
          allPostsRead = true
        }
      }else{
        console.log('no posts found')
      }*/

      //release the connection back to the pool when finished
      connection.release();
    })
    getPostsRequest.on('row', function(columns){
      postsList.add(columns)
    })

    connection.execSql(getPostsRequest)
  })

  /*if(IsDoneReadingAllPostsInSecretFile(secretFileName)){
    reply({text: 'That\s all the posts in '+secretFileName+' for now. I\'ll notify you when another is posted!'
          },
      (err, info) => {
        if(err){
          console.log(err.message)
          throw err
        }
    })
  }else{
      
  }*/
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
  var userSubscriptionList = ''//get value of current user subscriptions

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
            userSubscriptionList = (arr[0])[7].value
            userSubscriptionList += secretfile+VALUESEPARATOR

            //go ahead and update value
            var rowList = new List()
            var updateRequest = new Request("UPDATE ACCOUNTITEM SET subscribedTo=@subscriptions WHERE username=@userid", function(err) {  
              if (err) {  
                console.log(err);
              }  

              //if subscribed succesfully
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

              //update GroupItem table too //consider executing on one statement

              //release the connection back to the pool when finished
              connection.release();
            });  

            updateRequest.addParameter('userid', TYPES.NVarChar, userid)
            updateRequest.addParameter('subscriptions', TYPES.NVarChar, userSubscriptionList)

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
          pool.acquire(function(err, connection){
              var queryRequest = new Request(
                'INSERT INTO POSTITEM (postImage, userId, groupID, reactionCount, body, title) VALUES (@image, @userid, @groupid, @reactionCount, @bodyText, @titleText)', 
              function(err) {  
                if (err) {  
                  console.log(err);
                  SomethingWentWrong("posting", reply)
                } else{
                  TellUserSuccess("Posted to "+secretfileid+"!", reply)
                }

                //release the connection back to the pool when finished
                connection.release();
              });  
              queryRequest.addParameter('image', TYPES.NVarChar, '');
              queryRequest.addParameter('userid', TYPES.NVarChar, '');
              queryRequest.addParameter('groupid', TYPES.NVarChar, secretfileid);
              queryRequest.addParameter('reactionCount', TYPES.NVarChar, '');
              queryRequest.addParameter('bodyText', TYPES.NVarChar, postText);
              queryRequest.addParameter('titleText', TYPES.NVarChar, /*'#'+*/ removeSpaces(secretfileid)+totalSecretFileCount);
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

bot.on('message', (callbackObject, reply) => {
  console.log('received message '+callbackObject.message.text+ ' from user '+callbackObject.sender.id)

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
    SendMessageToWitAI(callbackObject.sender.id, callbackObject.message.text)
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
  }

  //actions from hamburger icon on left of message field
  else handlePersistentMenuActions(_payload, postbackContainer.sender.id, reply)
})

///////////////////////////////

/////////////////////////////// Helper functions

function CreatePostHTML(filename, postTitle){
  //render html text string with pug
  var html = compiledFunction({
    secretfilenumber: postTitle
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

function ShowPostsToUser(postList, reply){
  var elementsList = new List()
  var postsArr = postList.toArray()
  if(postsArr.length > 0){
    postsArr.forEach(function(columns){
      if(columns){
        //create html files for each post
        var filename = columns[10].value+".html"
        var url = "http://6fcc623b.ngrok.io/"//"http://localhost:"+port
                  +
                  "/"+filename
        var title = columns[10].value
        var desc = columns[9].value
        CreatePostHTML(filename, title)

        elementsList.add(
          createElementForPayloadForAttachmentForMessage(
            title,
            desc,
            '', '',
            //"https://4.bp.blogspot.com", 
            //"https://4.bp.blogspot.com/-BB8-tshB9fk/WA9IvvztmfI/AAAAAAAAcHU/hwMnPbAM4lUx8FtCTiSp7IpIes-S0RkLgCLcB/s640/dlsu-campus.jpg", 
            [
              createUrlButton("Read Full", url)//"https://www.facebook.com")//attempting to access local files doesnt work
              /*createButton("postback", 'Read This', 
                postbackCommentOnPostString+VALUESEPARATOR+columns[0].value+VALUESEPARATOR+columns[7].value),
              //createButton("postback", 'Read More', 
              // postbackReadMorePostsString+VALUESEPARATOR+columns[0].value+VALUESEPARATOR+columns[7].value)*/
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
      }
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

function ShowAllSubscribedPosts(payload, reply, userid){
  console.log('In ShowAllSubscribedPosts, userid: '+userid)
  var secretfilename = ''
  var elementsList = new List()

  //ask user which subscribed secret file to read from
  var accountList = new List()
  pool.acquire(function(err, connection){
    if (err) {
        console.error(err);
        return;
    }

    var selectRequest = new Request(
      'SELECT subscribedTo FROM ACCOUNTITEM WHERE username=@userid',
      function(err){
        if (err) {  
          console.log(err);
        } 

        //done executing
        var accountsArr = accountList.toArray()
        if(accountsArr.length == 0){
          console.log('No accounts found')
        }
        else if(accountsArr.length > 1){
          console.log('multiple accounts detected')
        }else{
          //now for each secret file in the 'subscribedTo' field, create a new element for the attachment and add it to elementsList, then when done create the attachment and send to user using 'reply' object
          accountsArr.every(function(subscribedToString){
            var secretfilesArr = subscribedToString.trim().split(VALUESEPARATOR)
            //console.log(userid+' subscribed to '+secretfilesArr.length+' secret files')
            var matchingSecretFileList = new List()

            for(var c = 0;c < secretfilesArr.length -1;c++){
              console.log('SUBSCRIPTION ITERATION OUTSIDE secretFileRequest: '+c)
              var afterLoopThreadCounter = 0
              var secretfilename = secretfilesArr[c]
              try{
                    pool.acquire(function(err, connection){
                      if (err) {
                          console.error(err);
                          return;
                      }

                      //console.log('fetching groupitem data of '+ secretfilename)
                      var secretFileRequest = new Request('SELECT * FROM GROUPITEM WHERE groupName=@secretfilename',
                        function(err){
                          if (err) {  
                            console.log(err);
                          }
                      })
                      secretFileRequest.addParameter('secretfilename', TYPES.NVarChar, secretfilename) 
                      secretFileRequest.on('row', function(cols){
                          //bug - adds same row data on multiple row events due to parrallel queries
                          elementsList.add(createElementForPayloadForAttachmentForMessage(
                            (cols[5]).value,
                            (cols[6]).value, '', '',
                            [
                              createButton("postback", postbackReadFromThisSecretFileString, 
                                postbackReadFromThisSecretFileString+VALUESEPARATOR+cols[5].value)
                            ]
                          ))
                      })
                      secretFileRequest.on('requestCompleted', function(){
                          afterLoopThreadCounter++
                          var elements = elementsList.toArray()
                          console.log('SUBSCRIPTION ITERATION: '+c)
                          
                          //ask user which secret file to read from
                          if(afterLoopThreadCounter == secretfilesArr.length - 1){
                            if(elements.length > 0) {
                              ShowAttachmentToUser('Which Secret File do you want to read?', elements, reply)
                            }else {
                              reply(
                                { text: 'You\'re not subscribed to any Secret Files yet' }, (err, info) => {
                                  if(err){
                                    console.log(err.message)
                                    throw err
                                  }
                              })
                              ShowSecretFilesSubscriptions(userid, reply, SubscribeStringPostback)
                            }
                            afterLoopThreadCounter = 0;
                          }

                          //release the connection back to the pool when finished
                          connection.release();
                      })
                      connection.execSql(secretFileRequest)
                    })
              }catch(err){
                console.log('error in ShowSubscribedPosts: '+err.message)
              }
            }

            return false
          })
        }

        

        //release the connection back to the pool when finished
        connection.release();
      }
    )
    selectRequest.addParameter('userid', TYPES.NVarChar, userid)
    selectRequest.on('row', function(columns){
      accountList.add(columns[0].value)
      console.log('added new row in selectRequest for accountsList')
    })
    connection.execSql(selectRequest)
    
  })

  //FetchPostsInSecretFile(secretfilename)
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

  CreateNewSecretFileRecord('Ateneo Secret Files', 'Description here', '')
}

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
        var queryRequest = new Request(GETALLSECRETFILESQUERY, function(err) {  
          if (err) {  
              console.log(err);}  
          }
        );  

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
          console.log(rowList.toArray().length + ' rows returned');  
          rowList.forEach(function(columns){
            elementsList.add(createElementForPayloadForAttachmentForMessage(
              columns[5].value,
              columns[6].value,
              "https://4.bp.blogspot.com", 
              "https://4.bp.blogspot.com/-BB8-tshB9fk/WA9IvvztmfI/AAAAAAAAcHU/hwMnPbAM4lUx8FtCTiSp7IpIes-S0RkLgCLcB/s640/dlsu-campus.jpg", 
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

app.get('/webhook', (req, res) => {
  return bot._verify(req, res)
})

app.post('/webhook', (req, res) => {
  bot._handleMessage(req.body)
  res.end(JSON.stringify({status: 'ok'}))
})

//http.createServer(app).listen(port)
app.listen(port)
console.log('Express NodeJS bot server running at port '+ port)

//for webhook w facebook messenger
//heroku server running at url https://murmuring-depths-99314.herokuapp.com/ and verify token 'token'

//////////////////////////////////