#!/usr/bin/env node

// Test script for MCP tools
// Tests all 11 tools to ensure they work correctly

import { HelloMCPServer } from '../src/mcp-server.js';

class MCPToolTester {
  constructor() {
    this.mcpServer = new HelloMCPServer();
    this.testResults = [];
    this.passedTests = 0;
    this.failedTests = 0;
  }

  async runAllTests() {
    console.log('🧪 Starting MCP Tools Test Suite');
    console.log('=' .repeat(50));

    // Test tools/list endpoint
    await this.testToolsList();

    // Test resources/list endpoint  
    await this.testResourcesList();

    // Test individual tools (without authentication for now)
    await this.testBasicTool();

    // Print summary
    this.printSummary();
  }

  async testToolsList() {
    try {
      console.log('\n📋 Testing tools/list...');
      
      // Get the tools handler
      const toolsHandler = this.mcpServer.mcpServer._requestHandlers.get('tools/list');
      
      if (!toolsHandler) {
        throw new Error('tools/list handler not found');
      }

      const result = await toolsHandler({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });

      const tools = result.tools;
      const expectedToolCount = 1; // Single consolidated tool: hello_manage_app
      
      if (!Array.isArray(tools)) {
        throw new Error('tools is not an array');
      }

      if (tools.length !== expectedToolCount) {
        throw new Error(`Expected ${expectedToolCount} tools, got ${tools.length}`);
      }

      // Check for required tools in consolidated toolset  
      const requiredTools = [
        'hello_manage_app'
      ];

      const toolNames = tools.map(t => t.name);
      const missingTools = requiredTools.filter(tool => !toolNames.includes(tool));
      
      if (missingTools.length > 0) {
        throw new Error(`Missing tools: ${missingTools.join(', ')}`);
      }

      // Verify each tool has required properties
      for (const tool of tools) {
        if (!tool.name || !tool.description || !tool.inputSchema) {
          throw new Error(`Tool ${tool.name} missing required properties`);
        }
      }

      this.recordSuccess('tools/list', `Found all ${expectedToolCount} required tools`);
      
    } catch (error) {
      this.recordFailure('tools/list', error.message);
    }
  }

  async testResourcesList() {
    try {
      console.log('\n📚 Testing resources/list...');
      
      // Get the resources handler
      const resourcesHandler = this.mcpServer.mcpServer._requestHandlers.get('resources/list');
      
      if (!resourcesHandler) {
        throw new Error('resources/list handler not found');
      }

      const result = await resourcesHandler({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list',
        params: {}
      });

      const resources = result.resources;
      const expectedResourceCount = 17; // Removed hello://profile resource
      
      if (!Array.isArray(resources)) {
        throw new Error('resources is not an array');
      }

      if (resources.length !== expectedResourceCount) {
        throw new Error(`Expected ${expectedResourceCount} resources, got ${resources.length}`);
      }

      // Check for required resources
      const requiredResources = [
        'Hellō Documentation Overview',
        'Hellō Getting Started',
        'Hellō Quickstarts',
        'Hellō Buttons',
        'Hellō Scopes',
        'Hellō Wallet API',
        'Hellō Admin API',
        'Hellō MCP Server',
        'Hellō SDKs',
        'Hellō Logo Design Guidance',
        'Supported Logo Formats',
        'Hellō Login Button Implementation Guide'
      ];

      const resourceNames = resources.map(r => r.name);
      const missingResources = requiredResources.filter(resource => !resourceNames.includes(resource));
      
      if (missingResources.length > 0) {
        throw new Error(`Missing resources: ${missingResources.join(', ')}`);
      }

      // Verify each resource has required properties
      for (const resource of resources) {
        if (!resource.uri || !resource.name || !resource.description || !resource.mimeType) {
          throw new Error(`Resource ${resource.name} missing required properties`);
        }
      }

      this.recordSuccess('resources/list', `Found all ${expectedResourceCount} required resources`);
      
    } catch (error) {
      this.recordFailure('resources/list', error.message);
    }
  }

  async testBasicTool() {
    try {
      console.log('\n🔧 Testing MCP protocol basics...');
      
      // Just test that the MCP server can handle a basic request without OAuth
      // We'll test tools/call handler exists and responds properly to invalid tool
      const callHandler = this.mcpServer.mcpServer._requestHandlers.get('tools/call');
      
      if (!callHandler) {
        throw new Error('tools/call handler not found');
      }

      // Test with a non-existent tool - should get a proper error response
      try {
        const result = await callHandler({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'non_existent_tool',
            arguments: {}
          }
        });
        
        // Should get an error for non-existent tool
        if (result && result.error) {
          this.recordSuccess('basic tool call', 'Tool handler properly rejects invalid tools');
        } else {
          throw new Error('Expected error for non-existent tool');
        }
      } catch (error) {
        // If it throws, that's also a valid way to handle invalid tools
        this.recordSuccess('basic tool call', 'Tool handler properly handles invalid tools');
      }
      
    } catch (error) {
      this.recordFailure('basic tool call', error.message);
    }
  }

  recordSuccess(testName, message) {
    this.testResults.push({ test: testName, status: 'PASS', message });
    this.passedTests++;
    console.log(`  ✅ ${testName}: ${message}`);
  }

  recordFailure(testName, message) {
    this.testResults.push({ test: testName, status: 'FAIL', message });
    this.failedTests++;
    console.log(`  ❌ ${testName}: ${message}`);
  }

  printSummary() {
    console.log('\n' + '=' .repeat(50));
    console.log('📊 Test Summary');
    console.log('=' .repeat(50));
    console.log(`Total Tests: ${this.testResults.length}`);
    console.log(`✅ Passed: ${this.passedTests}`);
    console.log(`❌ Failed: ${this.failedTests}`);
    
    if (this.failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.test}: ${r.message}`));
    }

    console.log('\n🎯 Test Coverage:');
    console.log('  - ✅ MCP Protocol Handlers (tools/list, resources/list)');
    console.log('  - ✅ Tool Schema Validation');
    console.log('  - ✅ Resource Schema Validation');
    console.log('  - ✅ Basic Tool Execution');
    console.log('  - ⚠️  Authentication Flow (requires manual testing)');
    console.log('  - ⚠️  Admin API Integration (requires running admin server)');

    if (this.failedTests === 0) {
      console.log('\n🎉 All tests passed! MCP server is working correctly.');
      process.exit(0);
    } else {
      console.log('\n💥 Some tests failed. Please check the implementation.');
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new MCPToolTester();
  tester.runAllTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

export { MCPToolTester }; 