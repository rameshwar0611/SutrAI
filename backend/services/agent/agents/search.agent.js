import { checkAgentLimit } from "../config/agentLimit.js"
import { searchTool } from "../config/tavily.js"
export const searchAgent = async (state) => {

        await checkAgentLimit(state.userId, "search")
        const results = await searchTool.invoke({
            query: state.prompt
        })

        return {
            ...state,
            searchResults: results,
            images: results.images
        }

}
