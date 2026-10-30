import { createSlice } from "@reduxjs/toolkit";

const messageSlice=createSlice({
    name:"message",
    initialState:{
      messages:[],
      artifacts:[],
      isLoading:false
      
    },
    reducers:{
       setMessages:(state,action)=>{
        state.messages=action.payload
       },
        addMessage:(state,action)=>{
        state.messages.push(action.payload)
       },
       removeMessage:(state,action)=>{
        state.messages=state.messages.filter(message=>message.clientId!==action.payload)
       },
       setArtifacts:(state,action)=>{
        state.artifacts=action.payload
       },
       setIsLoading:(state,action)=>{
        state.isLoading=action.payload
       }
      

    }
   
})

export const {setMessages,addMessage,removeMessage,setArtifacts,setIsLoading}=messageSlice.actions
export default messageSlice.reducer

