import User from "../models/user.js";




export const startDiditWorkflow = async (req, res) => {
  try {
    const API_KEY = process.env.DIDIT_API_KEY;
    const WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID; // Workflow ID from DIDIT console

    if (!API_KEY) {
      return res.status(500).json({ message: "Missing DIDIT_API_KEY" });
    }

    if (!WORKFLOW_ID) {
      return res.status(500).json({ message: "Missing DIDIT_WORKFLOW_ID" });
    }

    // Get user ID from request (from auth middleware or body)
    const userId = req.user?.id || req.body?.userId || req.query?.userId;

    // START WORKFLOW SESSION
    const workflowData = {
      workflow_id: WORKFLOW_ID,
      vendor_data: userId || "user_verification", 
      callback: process.env.DIDIT_CALLBACK_URL || `${process.env.BASE_URL || process.env.SERVER_URL || "http://localhost:5000"}/api/callback`, 
    };

    let startResponse;
    let startJson;

    try {
      startResponse = await fetch("https://verification.didit.me/v2/session/", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(workflowData),
      });

      startJson = await startResponse.json();
    } catch (err) {
      // Fallback: Try /v2/workflows/start endpoint
      console.log("Trying fallback endpoint /v2/workflows/start");
      startResponse = await fetch("https://verification.didit.me/v2/workflows/start", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(workflowData),
      });

      startJson = await startResponse.json();
    }

    if (!startResponse.ok) {
      console.error("Failed to start Didit workflow:", startJson);
      return res.status(400).json({
        message: "Failed to start Didit workflow",
        details: startJson,
      });
    }

    const sessionId = startJson.session_id;
    // DIDIT returns the verification URL in different possible fields
    const workflowUrl = startJson.url || startJson.verification_url || startJson.redirect_url;

    if (!workflowUrl && sessionId) {
      const constructedUrl = `https://verification.didit.me/verify/${sessionId}`;
      console.log("✅ Workflow session started (constructed URL):", sessionId);

      return res.status(200).json({
        message: "Workflow session created successfully",
        sessionId,
        workflowUrl: constructedUrl,
        redirectUrl: constructedUrl,
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        message: "No session ID received from DIDIT",
        details: startJson,
      });
    }

    console.log("✅ Workflow session started:", sessionId, "URL:", workflowUrl);

    return res.status(200).json({
      message: "Workflow session created successfully",
      sessionId,
      workflowUrl: workflowUrl || `https://verification.didit.me/verify/${sessionId}`,
      redirectUrl: workflowUrl || `https://verification.didit.me/verify/${sessionId}`,
    });

  } catch (error) {
    console.error("DIDIT workflow error:", error);
    return res.status(500).json({
      message: "Failed to start workflow",
      error: error.message,
    });
  }
};




export const diditWebhookCallback = async (req, res) => {
  try {
    const { session_id, status, vendor_data, result } = req.body;

    console.log("📥 DIDIT Webhook received:", {
      session_id,
      status,
      vendor_data,
      result,
    });

    const statusLower = status?.toLowerCase();
    const isFinal =
      statusLower === "approved" ||
      status === "completed" ||
      status === "success" ||
      status === "failed" ||
      result !== undefined;

    if (!isFinal) {
      console.log(`⏳ Verification pending: ${status}`);
      return res.status(200).json({ message: "Pending update acknowledged" });
    }

    const isVerified =
      statusLower === "approved" ||
      status === "completed" ||
      status === "success" ||
      (result?.face_match?.match === true) ||
      (result?.verification?.status === "verified");

    if (vendor_data && vendor_data !== "user_verification") {
      const user = await User.findById(vendor_data);

      if (user) {
        user.verified = isVerified;
        await user.save();

        console.log(
          isVerified
            ? `✅ User ${vendor_data} verified successfully`
            : `❌ User ${vendor_data} final verification failed`
        );
      }
    }

    res.status(200).json({ message: "Webhook processed" });
  } catch (error) {
    console.error("DIDIT webhook error:", error);
    res.status(500).json({
      message: "Failed to process webhook",
      error: error.message,
    });
  }
};



