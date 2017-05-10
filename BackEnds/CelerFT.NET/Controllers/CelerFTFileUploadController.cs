/**
 * Description - This code provides the functionality to do Gigabit file uploads using ASP.NET Web API.
 *               The client application uploads a Gigabit sized file to the ASP.NET Web API backend in chunks, 
 *               and each chunk is saved by the ASP.NET Web API backend as a separate file. 
 *               The chunks are sent as multipart/form-data encoded data. The data can either by a binary file 
 *               or a base64 enocded version of the binary file.
 *               
 *               The ASP.NET Web API backend also provides the ability to resume a file upload.
 *               
 *               Once all of the data hase been received the client sends the ASP.NET Web API backend a 
 *               mergeall command and the ASP.NET Web API backend will merge all of the file chunks into a single file.
 *               
 *               The client can also send a getchecksum command to generate a MD5 hash of the uploaded file.
 *               
 * Author - Nigel Thomas
 * 
 * Copyright 2014 - 2016 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Http;
using System.IO;
using System.Collections.Specialized;
using System.Web;
using System.Configuration;
using System.Text;
using System.Security.Cryptography;



namespace CelerFToverHTTP.Controllers
{
    public class CelerFTFileUploadController : ApiController
    {
      

        private string getFileFolder(string directoryname)
        {
            
            var folder = ConfigurationManager.AppSettings["uploadpath"] + "\\" + directoryname;

            if (!System.IO.Directory.Exists(folder))
            {
                System.IO.Directory.CreateDirectory(folder);
            }

            return folder;
        }

        private static string GetHashFromFile(string fileName, HashAlgorithm algorithm)
        {
            using (var stream = new BufferedStream(File.OpenRead(fileName), (1024*1024)))
            {
                return BitConverter.ToString(algorithm.ComputeHash(stream)).Replace("-", string.Empty);
            }
        }

        private async Task<HttpResponseMessage> ProcessChunk(string filename, string directoryname, int chunknumber, int numberofChunks)
        {
            // Check if the request contains multipart/form-data.            
            if (!Request.Content.IsMimeMultipartContent())
            {
                throw new HttpResponseException(HttpStatusCode.UnsupportedMediaType);
            }

            // Check that we are not trying to upload a file greater than 50MB
            Int32 maxinputlength = 51 * 1024 * 1024;

            if (Convert.ToInt32(HttpContext.Current.Request.InputStream.Length) > maxinputlength)
            {
                return Request.CreateErrorResponse(HttpStatusCode.RequestEntityTooLarge, "Maximum upload chunk size exceeded");
            }

            // Check that we are not uploading more than the specified number of chunks
            if (chunknumber > numberofChunks)  {

                return Request.CreateErrorResponse(HttpStatusCode.Forbidden, "Chunk Number is greater than the Total Number of file chunks");
            }

            try
            {

                byte[] filedata = null;

                // If we have the custom header then we are processing hand made multipart-form-data
                if (HttpContext.Current.Request.Headers["CelerFT-Encoded"] != null)
                {

                    // Read in the request
                    HttpPostedFileBase base64file = new HttpPostedFileWrapper(HttpContext.Current.Request.Files["Slice"]);

                    if (base64file == null)
                    {
                        return Request.CreateErrorResponse(HttpStatusCode.BadRequest, "No file chunk uploaded");
                    }

                    // Convert the base64 string into a byte array
                    byte[] base64filedata = new byte[base64file.InputStream.Length];
                    await base64file.InputStream.ReadAsync(base64filedata, 0, Convert.ToInt32(HttpContext.Current.Request.InputStream.Length));

                    var base64string = System.Text.UTF8Encoding.UTF8.GetString(base64filedata);

                    filedata = Convert.FromBase64String(base64string);

                }
                else
                {

                    HttpPostedFileBase file = new HttpPostedFileWrapper(HttpContext.Current.Request.Files["Slice"]);

                    if (file == null)
                    {
                        return Request.CreateErrorResponse(HttpStatusCode.BadRequest, "No file chunk uploaded");
                    }

                    filedata = new byte[file.InputStream.Length];
                    await file.InputStream.ReadAsync(filedata, 0, Convert.ToInt32(HttpContext.Current.Request.InputStream.Length));

                }

                if (filedata == null)
                {

                    return Request.CreateErrorResponse(HttpStatusCode.BadRequest, "No file chunk uploaded");
                }

                // Write the byte array to a file
                var newfilename = filename.Split('.');
                string baseFilename = Path.GetFileNameWithoutExtension(filename);
                string extension = Path.GetExtension(filename);

                string tempdirectoryname = Path.GetFileNameWithoutExtension(filename);
                var localFilePath = getFileFolder(directoryname + "\\" + tempdirectoryname) + "\\" + baseFilename + "." + chunknumber.ToString().PadLeft(16, Convert.ToChar("0")) + "." + extension + ".tmp";


                var input = new MemoryStream(filedata);
                var outputFile = File.Open(localFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.Read);

                await input.CopyToAsync(outputFile);
                input.Close();
                outputFile.Close();


                filedata = null;

                return new HttpResponseMessage()
                {
                    Content = new StringContent(localFilePath),
                    StatusCode = HttpStatusCode.Created
                };
            }
            catch (Exception ex)
            {
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError, ex);
            }
        }

        [System.Web.Http.HttpPost]
        [Route("api/CelerFTFileUpload/UploadChunk/Base64")]
        public async Task<HttpResponseMessage> Base64(string filename, string directoryname, int chunknumber, int numberofChunks)
        {

            HttpResponseMessage returnmessage = await ProcessChunk(filename, directoryname, chunknumber, numberofChunks);
            return returnmessage;
        }

        [System.Web.Http.HttpPost]
        [Route("api/CelerFTFileUpload/UploadChunk/FormData")]
        public async Task<HttpResponseMessage> FormData(string filename, string directoryname, int chunknumber, int numberofChunks)
        {

            HttpResponseMessage returnmessage = await ProcessChunk(filename, directoryname, chunknumber, numberofChunks);
            return returnmessage;
        }

        [System.Web.Http.HttpPost]
        [Route("api/CelerFTFileUpload/UploadChunk/XFileName")]
        public async Task<HttpResponseMessage> XFileName(string filename, string directoryname, int chunknumber, int numberofChunks)
        {

            HttpResponseMessage returnmessage = await ProcessChunk(filename, directoryname, chunknumber, numberofChunks);
            return returnmessage;
        }

        [System.Web.Http.HttpGet]
        [Route("api/CelerFTFileUpload/GetChunkInfo")]
        public HttpResponseMessage GetChunkInfo(string filename, string directoryname, int chunknumber)
        //public async Task<HttpResponseMessage> GetChunkInfo(string filename, string directoryname, int chunknumber)
        {
            try
            {
                // check if the file chunk exists
                var newfilename = filename.Split('.');
                string baseFilename = Path.GetFileNameWithoutExtension(filename);
                string extension = Path.GetExtension(filename);

                string tempdirectoryname = Path.GetFileNameWithoutExtension(filename);
                var localFilePath = getFileFolder(directoryname + "\\" + tempdirectoryname) + "\\" + baseFilename + "." + chunknumber.ToString().PadLeft(16, Convert.ToChar("0")) + "." + extension + ".tmp";

                if (System.IO.File.Exists(localFilePath))
                {
                    return new HttpResponseMessage()
                    {
                        Content = new StringContent(localFilePath),
                        StatusCode = HttpStatusCode.OK
                    };
                }

                return new HttpResponseMessage()
                {
                    Content = new StringContent(localFilePath),
                    StatusCode = HttpStatusCode.NotFound
                };

            }
            catch (Exception ex)
            {
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError, ex);
            }

        }

        [System.Web.Http.HttpGet]
        [Route("api/CelerFTFileUpload/GetFileInfo")]
        public HttpResponseMessage GetFileInfo(string filename, string directoryname)
        {
            try
            {
                string baseFilename = Path.GetFileNameWithoutExtension(filename);
                string extension = Path.GetExtension(filename);
                string localFilePath = getFileFolder(directoryname + "\\") + baseFilename + extension;
                
                if (System.IO.File.Exists(localFilePath))
                {
                    return new HttpResponseMessage()
                    {
                        Content = new StringContent(localFilePath),
                        StatusCode = HttpStatusCode.OK
                    };
                }
                
                return new HttpResponseMessage()
                {
                    Content = new StringContent(localFilePath),
                    StatusCode = HttpStatusCode.NotFound
                };
            }

            catch (Exception ex)
            {
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError, ex);
            }
        }

        [System.Web.Http.HttpGet]
        public HttpResponseMessage MergeAll(string filename, string directoryname, int numberofChunks)
        //public async Task<HttpResponseMessage> MergeAll(string filename, string directoryname, int numberofChunks)
        {
           
            string tempdirectoryname = Path.GetFileNameWithoutExtension(filename);
            var localFilePath = getFileFolder(directoryname + "\\" + tempdirectoryname) + "\\";
            DirectoryInfo diSource = new DirectoryInfo(localFilePath);
            string baseFilename = Path.GetFileNameWithoutExtension(filename);
            string extension = Path.GetExtension(filename);

            // If the number of uploaded files is less than the total number of files then             
            // return an error. This will happen in asynchronous file uploads where the final             
            // chunk arrives before other chunks 
            try
            {
                if (diSource.GetFiles("*.tmp").Length != numberofChunks)
                {
                    return Request.CreateErrorResponse(HttpStatusCode.BadRequest, "Number of file chunks less than total count");
                }
            }
            catch (Exception ex)
            {
                //return Request.CreateErrorResponse(HttpStatusCode.InternalServerError, ex);
                return Request.CreateErrorResponse(HttpStatusCode.BadRequest, "Number of file chunks less than total count");
            }


            FileStream outputFile = new FileStream(localFilePath + baseFilename + extension, FileMode.OpenOrCreate, FileAccess.Write);

            try
            {
                // Get all of the file chunks in the directory and use them to create the file.
                // All of the file chunks are named in sequential order.
                foreach (FileInfo fiPart in diSource.GetFiles("*.tmp")) {

                    byte[] filedata = System.IO.File.ReadAllBytes(fiPart.FullName);
                    outputFile.Write(filedata, 0, filedata.Length);
                    File.Delete(fiPart.FullName);

                }

                outputFile.Flush();
                outputFile.Close();

                // Move the file to the top level directory
                string oldfilelocation = localFilePath + baseFilename + extension;
                string newfilelocation = getFileFolder(directoryname + "\\") + baseFilename + extension;

                // Check if the file exists. If it does delete it then move the file
                if(System.IO.File.Exists(newfilelocation)) {
                    System.IO.File.Delete(newfilelocation);
                }
                System.IO.File.Move(oldfilelocation, newfilelocation);

                // Delete the temporary directory
                System.IO.Directory.Delete(localFilePath);

                                
                return new HttpResponseMessage()
                {
                    Content = new StringContent("Sucessfully merged file " + filename),
                    StatusCode = HttpStatusCode.Created
                };


            }
            catch (Exception ex)
            {
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError, ex);
            }

        }

        [System.Web.Http.HttpGet]
        [Route("api/CelerFTFileUpload/GetChecksum")]
        public HttpResponseMessage GetCheckSum(string filename, string directoryname)
        {
            try
            {
                string baseFilename = Path.GetFileNameWithoutExtension(filename);
                string extension = Path.GetExtension(filename);
                string filelocation = getFileFolder(directoryname + "\\") + baseFilename + extension;

                // Get the MD5 hash for the file and send it back to the client
                HashAlgorithm MD5 = new MD5CryptoServiceProvider();
                string checksumMd5 = GetHashFromFile(filelocation, MD5);

                return new HttpResponseMessage()
                {
                    Content = new StringContent(checksumMd5),
                    StatusCode = HttpStatusCode.OK
                };

            }
                       
            catch (Exception ex)
            {
                return Request.CreateErrorResponse(HttpStatusCode.InternalServerError, ex);
            }
        }

        
    }
    
  
}
